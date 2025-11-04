import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import { DynamicTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as pineconeService from './pinecone-service.js';
import fetch from 'node-fetch';

/**
 * Agent State Definition using LangGraph Annotation
 */
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  }),
  websiteContent: Annotation<string>({
    reducer: (_x: string, y: string) => y || _x,
    default: () => '',
  }),
});

type AgentState = typeof AgentStateAnnotation.State;

/**
 * Create ChatOpenAI model for the agent
 */
function createAgentModel(): ChatOpenAI {
  if (!config.ai.openai.apiKey) {
    throw new Error('OpenAI API key is required');
  }

  return new ChatOpenAI({
    apiKey: config.ai.openai.apiKey,
    model: config.ai.openai.model,
    temperature: config.ai.openai.temperature,
    maxTokens: config.ai.openai.maxTokens,
  });
}

/**
 * Fetch website content utility
 */
async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    logger.debug('Fetching website content', { url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.ai.agent.websiteTimeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': config.ai.agent.websiteUserAgent,
      },
      signal: controller.signal as any,
    } as any);

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Basic text extraction from HTML (remove tags, clean whitespace)
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, config.ai.agent.maxWebsiteContentLength);

    logger.info('Website content fetched successfully', { url, contentLength: textContent.length });

    return textContent;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website fetch failed', error instanceof Error ? error : new Error(errorMsg));
    throw new Error(`Failed to fetch website: ${errorMsg}`);
  }
}

/**
 * Fetch and parse sitemap XML to get all page URLs
 * Handles both regular sitemaps and sitemap indexes (which reference other sitemaps)
 */
async function fetchSitemapUrls(sitemapUrl: string, visited: Set<string> = new Set()): Promise<string[]> {
  // Prevent infinite loops by tracking visited sitemaps
  if (visited.has(sitemapUrl)) {
    logger.debug('Sitemap already visited, skipping', { sitemapUrl });
    return [];
  }
  visited.add(sitemapUrl);

  try {
    logger.debug('Fetching sitemap', { sitemapUrl });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.ai.agent.websiteTimeout);

    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': config.ai.agent.websiteUserAgent,
      },
      signal: controller.signal as any,
    } as any);

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('Sitemap fetch failed', { status: response.status, statusText: response.statusText });
      return [];
    }

    const xml = await response.text();

    // Check if this is a sitemap index (contains <sitemapindex> tag)
    const isSitemapIndex = xml.includes('<sitemapindex');

    if (isSitemapIndex) {
      logger.debug('Detected sitemap index, fetching nested sitemaps', { sitemapUrl });
      
      // Extract nested sitemap URLs
      const sitemapRegex = /<loc>(.*?)<\/loc>/g;
      const nestedSitemapUrls: string[] = [];
      let match;

      while ((match = sitemapRegex.exec(xml)) !== null) {
        nestedSitemapUrls.push(match[1].trim());
      }

      logger.info('Found nested sitemaps', { count: nestedSitemapUrls.length, sitemaps: nestedSitemapUrls });

      // Recursively fetch all URLs from nested sitemaps
      const allUrls: string[] = [];
      for (const nestedSitemapUrl of nestedSitemapUrls) {
        const urls = await fetchSitemapUrls(nestedSitemapUrl, visited);
        allUrls.push(...urls);
        
        // Stop if we've reached the max
        if (allUrls.length >= config.ai.agent.maxPagesToSearch) {
          break;
        }
      }

      logger.info('Total URLs extracted from sitemap index', { count: allUrls.length, indexUrl: sitemapUrl });
      return allUrls.slice(0, config.ai.agent.maxPagesToSearch);
    } else {
      // Regular sitemap - extract page URLs
      const urlRegex = /<loc>(.*?)<\/loc>/g;
      const urls: string[] = [];
      let match;

      while ((match = urlRegex.exec(xml)) !== null) {
        urls.push(match[1].trim());
        if (urls.length >= config.ai.agent.maxPagesToSearch) {
          break;
        }
      }

      logger.info('Sitemap URLs extracted', { count: urls.length, sitemapUrl });
      return urls;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Sitemap fetch error', { sitemapUrl, error: errorMsg });
    return [];
  }
}

/**
 * Search website pages from sitemap for relevant content
 * Uses Pinecone for caching and vector similarity search
 */
async function searchWebsiteSitemap(query: string): Promise<string> {
  try {
    if (!config.ai.agent.sitemapUrl) {
      return 'Website sitemap URL not configured.';
    }

    if (!config.ai.agent.websiteSearchEnabled) {
      return 'Website search is disabled.';
    }

    logger.debug('Searching website sitemap', { query, sitemapUrl: config.ai.agent.sitemapUrl });

    // Initialize Pinecone if configured
    const usePinecone = !!config.ai.pinecone.apiKey;
    if (usePinecone) {
      try {
        await pineconeService.initialize();
      } catch (error) {
        logger.warn('Pinecone initialization failed, falling back to direct search', { error });
      }
    }

    // Fetch all URLs from sitemap
    const pageUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);

    if (pageUrls.length === 0) {
      return 'No pages found in sitemap.';
    }

    logger.debug('URLs from sitemap', { totalPages: pageUrls.length });

    // If Pinecone is available, try vector search first
    if (usePinecone && pineconeService) {
      try {
        // Check which URLs need to be fetched (not in cache or stale)
        const urlsToFetch = await pineconeService.getUrlsToFetch(pageUrls);
        
        // Fetch and cache new/stale pages
        if (urlsToFetch.length > 0) {
          logger.info('🌐 FETCHING FROM WEBSITE - Cache miss or stale', { 
            totalPages: pageUrls.length,
            cachedPages: pageUrls.length - urlsToFetch.length,
            pagesToFetch: urlsToFetch.length,
            source: 'WEBSITE_DIRECT'
          });
          
          const pageContents: Array<{ url: string; title: string; content: string }> = [];
          const batchSize = 3;

          for (let i = 0; i < urlsToFetch.length; i += batchSize) {
            const batch = urlsToFetch.slice(i, i + batchSize);
            const batchResults = await Promise.all(
              batch.map(async (url) => {
                try {
                  const content = await fetchWebsiteContent(url);
                  // Extract title from URL (simple heuristic)
                  const title = url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Page';
                  logger.debug('✅ Page fetched from website', { url });
                  return { url, title, content };
                } catch (error) {
                  logger.debug('❌ Failed to fetch page', { url });
                  return null;
                }
              })
            );
            const validResults = batchResults.filter((page): page is { url: string; title: string; content: string } => 
              page !== null && page.content.length > 0
            );
            pageContents.push(...validResults);
          }

          if (pageContents.length > 0) {
            // Store fetched pages in Pinecone
            await pineconeService.storePagesContent(pageContents);
            logger.info('💾 STORED IN PINECONE CACHE', { 
              count: pageContents.length,
              action: 'CACHE_WRITE'
            });
          }
        } else {
          logger.info('⚡ USING PINECONE CACHE - All pages cached', { 
            totalPages: pageUrls.length,
            source: 'PINECONE_CACHE',
            action: 'CACHE_HIT'
          });
        }

        // Perform vector similarity search
        const results = await pineconeService.searchSimilar(query, 3);
        
        if (results.length === 0) {
          return `No relevant content found on the website for query: "${query}"`;
        }

        logger.info('🔍 SEARCH COMPLETED - Results from Pinecone', { 
          query, 
          resultsFound: results.length,
          source: 'PINECONE_VECTOR_SEARCH',
          topScore: results[0]?.score.toFixed(4)
        });

        // Format results
        const formattedResults = results
          .map((page, index) => {
            return `\n[Result ${index + 1}] 📄 From: ${page.url}\n🎯 Relevance Score: ${page.score.toFixed(4)}\n📝 Content:\n${page.content.substring(0, 800)}...\n`;
          })
          .join('\n');

        return `✅ Found ${results.length} relevant pages (from Pinecone cache):\n${formattedResults}`;
      } catch (error) {
        logger.error('❌ Pinecone search failed, falling back to keyword search', { error });
        // Fall through to keyword search below
      }
    }

    // Fallback: Direct keyword-based search (if Pinecone is not available or failed)
    logger.info('⚠️ USING KEYWORD SEARCH - Pinecone not available', { 
      source: 'WEBSITE_DIRECT_KEYWORD_SEARCH' 
    });
    
    const pageContents: Array<{ url: string; content: string }> = [];
    const batchSize = 3;

    for (let i = 0; i < pageUrls.length; i += batchSize) {
      const batch = pageUrls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          try {
            const content = await fetchWebsiteContent(url);
            return { url, content };
          } catch (error) {
            logger.debug('Failed to fetch page', { url });
            return { url, content: '' };
          }
        })
      );
      pageContents.push(...batchResults.filter((page) => page.content.length > 0));
    }

    logger.debug('Pages fetched successfully', { count: pageContents.length });

    if (pageContents.length === 0) {
      return 'No content could be retrieved from website pages.';
    }

    // Simple keyword-based search: find pages with most keyword matches
    const queryKeywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    
    const scoredPages = pageContents.map((page) => {
      const contentLower = page.content.toLowerCase();
      const matchCount = queryKeywords.reduce((count, keyword) => {
        return count + (contentLower.includes(keyword) ? 1 : 0);
      }, 0);
      return { ...page, score: matchCount };
    });

    // Sort by relevance and take top 3
    const topPages = scoredPages
      .filter((page) => page.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (topPages.length === 0) {
      return `No relevant content found on the website for query: "${query}"`;
    }

    logger.info('Website search completed', { query, resultsFound: topPages.length });

    // Format results
    const results = topPages
      .map((page, index) => {
        return `\n[Result ${index + 1}] From: ${page.url}\nRelevance Score: ${page.score}\nContent:\n${page.content.substring(0, 800)}...\n`;
      })
      .join('\n---\n');

    logger.info('Website search completed', { query, resultsFound: topPages.length });

    return `Found ${topPages.length} relevant page(s) on the website:\n${results}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website sitemap search error', error instanceof Error ? error : new Error(errorMsg));
    return `Website search encountered an error: ${errorMsg}`;
  }
}

/**
 * Website search tool - searches sitemap pages for relevant content
 * Using DynamicTool for compatibility with createReactAgent
 */
const websiteSearchTool = new DynamicTool({
  name: 'search_website_sitemap',
  description:
    'Search through all pages in the company website sitemap to find relevant information for answering customer questions. ' +
    'Use this tool when you need to find specific information that might be on the company website. ' +
    'The tool will search all website pages and return the most relevant content with URLs. ' +
    'Input should be the customer question or search query.',
  func: async (query: string) => {
    logger.debug('Website search tool invoked', { query });
    return await searchWebsiteSitemap(query);
  },
});

/**
 * Router node - decides if website sitemap search is needed
 */
async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Router node processing', { questionText: questionText.substring(0, 100) });

    // Always search website sitemap if enabled (for customer support questions)
    // This ensures we check the website content before answering
    const shouldSearchWebsite = config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl;

    if (shouldSearchWebsite) {
      logger.debug('Router decision: search website sitemap');
    } else {
      logger.debug('Router decision: answer directly (website search disabled)');
    }

    return {};
  } catch (error) {
    logger.error('Router node error', error instanceof Error ? error : new Error(String(error)));
    return {};
  }
}

/**
 * Website fetch node - searches website sitemap for relevant content
 */
async function fetchWebsiteNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Website search node: searching sitemap', { questionText: questionText.substring(0, 100) });

    // Use the sitemap search tool to find relevant content
    const searchResults = await searchWebsiteSitemap(questionText);

    logger.debug('Website search completed', { resultLength: searchResults.length });

    return {
      websiteContent: searchResults,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website search node error', error instanceof Error ? error : new Error(errorMsg));

    return {
      websiteContent: `Error searching website: ${errorMsg}`,
    };
  }
}

/**
 * Answer node - generates answer using ChatGPT
 */
async function answerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Answer node: generating response', {
      questionLength: questionText.length,
      hasWebsiteContent: state.websiteContent.length > 0,
    });

    const model = createAgentModel();

    // Build system prompt with or without website context
    const contextInfo = state.websiteContent
      ? `I have retrieved the following website content for you:\n\n${state.websiteContent}\n\nPlease use this information to answer the question.`
      : 'Use your general knowledge to answer the following question.';

    const systemPrompt = `You are a helpful AI assistant.

${contextInfo}

Answer clearly and concisely.`;

    // Create messages for model
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages.slice(0, -1), // Previous messages
      new HumanMessage(questionText), // Current question
    ];

    // Generate response
    const response = await model.invoke(messages);
    const answer = response.content.toString();

    logger.info('Answer generated successfully', { answerLength: answer.length });

    return {
      messages: [new AIMessage(answer)],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Answer node error', error instanceof Error ? error : new Error(errorMsg));
    return {
      messages: [new AIMessage(`Error generating answer: ${errorMsg}`)],
    };
  }
}

/**
 * Should fetch decision function for conditional edges
 */
function shouldFetchWebsite(state: AgentState): string {
  try {
    // Always search website sitemap if enabled, otherwise answer directly
    const shouldSearch = config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl;
    
    return shouldSearch ? 'fetch_website' : 'answer';
  } catch (error) {
    logger.error('Conditional edge error', error instanceof Error ? error : new Error(String(error)));
    return 'answer';
  }
}

/**
 * Create the LangGraph agent
 */
function createLangGraphAgent() {
  const graph = new StateGraph(AgentStateAnnotation)
    // Add nodes
    .addNode('router', routerNode)
    .addNode('fetch_website', fetchWebsiteNode)
    .addNode('answer', answerNode)
    // Add edges
    .addEdge(START, 'router')
    .addConditionalEdges('router', shouldFetchWebsite)
    .addEdge('fetch_website', 'answer')
    .addEdge('answer', END);

  // Compile with checkpointer for memory
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

/**
 * Create ReAct agent with website search tool
 * This agent can intelligently decide when to use the website search tool
 */
function createReactAgentWithTools() {
  const model = createAgentModel();
  
  // Collect tools to provide to the agent
  const tools = [];
  
  // Add website search tool if enabled
  if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
    tools.push(websiteSearchTool);
    logger.debug('Website search tool added to ReAct agent');
  }

  // Create ReAct agent with tools and memory
  const checkpointer = new MemorySaver();
  
  const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
    messageModifier: `You are a helpful AI assistant for customer support.

When a customer asks a question:
1. ALWAYS try to search the company website first using the search_website_sitemap tool
2. Use the website content to provide accurate, specific answers
3. If no relevant information is found on the website, use your general knowledge
4. Be helpful, professional, and friendly
5. Always cite the source URL when using website information`,
  });

  return agent;
}

/**
 * Process question with the agent
 */
export async function processQuestion(question: string, threadId?: string): Promise<string> {
  try {
    logger.debug('Processing question', { question: question.substring(0, 100), threadId });

    const configThreadId = threadId || `thread-${Date.now()}`;

    // Debug: Log config values
    logger.debug('Config check', {
      websiteSearchEnabled: config.ai.agent.websiteSearchEnabled,
      sitemapUrl: config.ai.agent.sitemapUrl,
      willUseReact: config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl,
    });

    // Use ReAct agent with tools if website search is enabled, otherwise use standard LangGraph agent
    if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
      logger.debug('Using ReAct agent with website search tool');
      
      const reactAgent = createReactAgentWithTools();
      
      const result = await reactAgent.invoke(
        {
          messages: [new HumanMessage(question)],
        },
        {
          configurable: {
            thread_id: configThreadId,
          },
        }
      );

      // Extract final answer from messages
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() || 'No response generated';

      logger.info('Question processed with ReAct agent', { answerLength: answer.length, threadId: configThreadId });

      return answer;
    } else {
      logger.debug('Using standard LangGraph agent');
      
      const agent = createLangGraphAgent();

      const initialState: AgentState = {
        messages: [new HumanMessage(question)],
        websiteContent: '',
      };

      const result = await agent.invoke(initialState, {
        configurable: {
          thread_id: configThreadId,
        },
      });

      // Extract final answer from messages
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() || 'No response generated';

      logger.info('Question processed with standard agent', { answerLength: answer.length, threadId: configThreadId });

      return answer;
    }
  } catch (error) {
    logger.error('Process question error', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Stream process question - yields chunks as they're generated (token by token)
 * Uses direct model streaming for true incremental responses
 */
export async function* processQuestionStream(question: string, threadId?: string): AsyncGenerator<string> {
  try {
    logger.debug('Processing question with streaming', { question: question.substring(0, 100), threadId });

    const configThreadId = threadId || `thread-${Date.now()}`;

    // For true streaming, we need to use model.stream() directly
    // ReAct agents don't support token-by-token streaming
    const model = createAgentModel();

    // Check if we should search website first
    if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
      logger.debug('Fetching website content before streaming response');
      
      // Fetch website content first (non-streaming)
      const websiteContent = await searchWebsiteSitemap(question);
      
      // Build system prompt with website context
      const systemPrompt = `You are a helpful AI assistant for customer support.

I have retrieved the following information from the company website:

${websiteContent}

Please use this information to answer the customer's question. Be helpful, professional, and friendly.
Always cite the source URL when using website information.`;

      // Stream the response with website context
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(question),
      ];

      logger.debug('Streaming response with website context');
      
      const stream = await model.stream(messages);
      
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content) {
          yield content;
          logger.debug('Stream chunk yielded', { size: content.length });
        }
      }

      logger.info('Question processed with streaming (with website search)', { 
        threadId: configThreadId 
      });
    } else {
      // Stream without website search
      logger.debug('Streaming response without website search');
      
      const systemPrompt = `You are a helpful AI assistant. Answer the following question clearly and concisely.`;

      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(question),
      ];

      const stream = await model.stream(messages);
      
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content) {
          yield content;
          logger.debug('Stream chunk yielded', { size: content.length });
        }
      }

      logger.info('Question processed with streaming (no website search)', { 
        threadId: configThreadId 
      });
    }
  } catch (error) {
    logger.error('Process question stream error', error instanceof Error ? error : new Error(String(error)));
    yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Create a session-based agent manager
 */
export function createSessionAgent(sessionId: string) {
  const conversationHistory: BaseMessage[] = [];

  return {
    /**
     * Add a question and get answer with conversation history
     */
    async ask(question: string): Promise<string> {
      try {
        logger.debug('Session agent ask', { sessionId, question: question.substring(0, 100) });

        conversationHistory.push(new HumanMessage(question));

        const answer = await processQuestion(question, sessionId);

        conversationHistory.push(new AIMessage(answer));

        return answer;
      } catch (error) {
        logger.error('Session agent ask error', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },

    /**
     * Stream a question with conversation context
     */
    async *askStream(question: string): AsyncGenerator<string> {
      try {
        logger.debug('Session agent ask stream', { sessionId, question: question.substring(0, 100) });

        conversationHistory.push(new HumanMessage(question));

        let fullAnswer = '';
        for await (const chunk of processQuestionStream(question, sessionId)) {
          fullAnswer += chunk;
          yield chunk;
        }

        conversationHistory.push(new AIMessage(fullAnswer));
      } catch (error) {
        logger.error('Session agent ask stream error', error instanceof Error ? error : new Error(String(error)));
        yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    /**
     * Get conversation history
     */
    getHistory(): BaseMessage[] {
      return conversationHistory;
    },

    /**
     * Clear history
     */
    clearHistory(): void {
      conversationHistory.length = 0;
      logger.debug('Session history cleared', { sessionId });
    },
  };
}

/**
 * Export types for use in handlers
 */
export type SessionAgent = ReturnType<typeof createSessionAgent>;
