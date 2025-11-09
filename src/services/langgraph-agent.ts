import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { DynamicTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { fetchWebsiteContent } from '@utils/website-content-extractor';
import * as pineconeService from './pinecone-service';
import fetch from 'node-fetch';
import { AgentStateAnnotation } from '@/types/agent';
import type { AgentState } from '@/types/agent';

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

async function fetchSitemapUrls(
  sitemapUrl: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
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
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      logger.error('Sitemap fetch failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }
    const xml = await response.text();
    const isSitemapIndex = xml.includes('<sitemapindex');
    if (isSitemapIndex) {
      logger.debug('Detected sitemap index, fetching nested sitemaps', { sitemapUrl });
      const sitemapRegex = /<loc>(.*?)<\/loc>/g;
      const nestedSitemapUrls: string[] = [];
      let match;
      while ((match = sitemapRegex.exec(xml)) !== null) {
        nestedSitemapUrls.push(match[1].trim());
      }
      logger.info('Found nested sitemaps', {
        count: nestedSitemapUrls.length,
        sitemaps: nestedSitemapUrls,
      });
      const allUrls: string[] = [];
      for (const nestedSitemapUrl of nestedSitemapUrls) {
        const urls = await fetchSitemapUrls(nestedSitemapUrl, visited);
        allUrls.push(...urls);
        if (allUrls.length >= config.ai.agent.maxPagesToSearch) {
          break;
        }
      }
      logger.info('Total URLs extracted from sitemap index', {
        count: allUrls.length,
        indexUrl: sitemapUrl,
      });
      return allUrls.slice(0, config.ai.agent.maxPagesToSearch);
    } else {
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

async function searchWebsiteSitemap(query: string): Promise<string> {
  try {
    if (!config.ai.agent.sitemapUrl) {
      return 'Website sitemap URL not configured.';
    }
    if (!config.ai.agent.websiteSearchEnabled) {
      return 'Website search is disabled.';
    }

    logger.debug('Searching website sitemap', { query, sitemapUrl: config.ai.agent.sitemapUrl });

    const usePinecone = !!config.ai.pinecone.apiKey;
    if (usePinecone) {
      try {
        await pineconeService.initialize();

        // 🚀 OPTIMIZATION: Try Pinecone search first (should be pre-populated by scheduled job)
        logger.debug('⚡ Attempting Pinecone search (should be pre-populated by scheduler)');
        const results = await pineconeService.searchSimilar(query, 3);

        if (results.length > 0) {
          logger.info('🔍 SEARCH COMPLETED - Results from Pre-populated Pinecone', {
            query,
            resultsFound: results.length,
            source: 'PINECONE_SCHEDULED_CACHE',
            topScore: results[0]?.score.toFixed(4),
          });

          const formattedResults = results
            .map((page, index) => {
              return `\n[Result ${index + 1}] 📄 From: ${page.url}\n🎯 Relevance Score: ${page.score.toFixed(4)}\n📝 Content:\n${page.content.substring(0, 800)}...\n`;
            })
            .join('\n');

          return `✅ Found ${results.length} relevant pages (from scheduled cache):\n${formattedResults}`;
        }

        // Fallback: Check if we need to fetch fresh content (should rarely happen with scheduler)
        logger.warn('⚠️ No results from Pinecone cache - checking if content needs refresh');

        const pageUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);
        if (pageUrls.length === 0) {
          return 'No pages found in sitemap.';
        }

        const urlsToFetch = await pineconeService.getUrlsToFetch(pageUrls);
        if (urlsToFetch.length > 0) {
          logger.warn('🔄 FALLBACK: Some content missing/stale - fetching during request', {
            totalPages: pageUrls.length,
            cachedPages: pageUrls.length - urlsToFetch.length,
            pagesToFetch: urlsToFetch.length,
            source: 'WEBSITE_DIRECT_FALLBACK',
          });

          // Limit fallback fetching to avoid timeout
          const limitedUrlsToFetch = urlsToFetch.slice(0, 5); // Max 5 pages to avoid timeout

          const pageContents: Array<{ url: string; title: string; content: string }> = [];
          const batchSize = 2; // Smaller batch for fallback

          for (let i = 0; i < limitedUrlsToFetch.length; i += batchSize) {
            const batch = limitedUrlsToFetch.slice(i, i + batchSize);
            const batchResults = await Promise.all(
              batch.map(async url => {
                try {
                  const content = await fetchWebsiteContent(url);
                  const title = url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Page';
                  return { url, title, content };
                } catch {
                  logger.debug('❌ Failed to fetch page in fallback', { url });
                  return null;
                }
              })
            );

            const validResults = batchResults.filter(
              (page): page is { url: string; title: string; content: string } =>
                page !== null && page.content.length > 0
            );
            pageContents.push(...validResults);
          }

          if (pageContents.length > 0) {
            await pineconeService.storePagesContent(pageContents);
            logger.info('💾 STORED FALLBACK CONTENT', {
              count: pageContents.length,
              action: 'FALLBACK_CACHE_WRITE',
            });
          }

          // Try search again after storing new content
          const fallbackResults = await pineconeService.searchSimilar(query, 3);
          if (fallbackResults.length > 0) {
            const formattedResults = fallbackResults
              .map((page, index) => {
                return `\n[Result ${index + 1}] 📄 From: ${page.url}\n🎯 Relevance Score: ${page.score.toFixed(4)}\n📝 Content:\n${page.content.substring(0, 800)}...\n`;
              })
              .join('\n');

            return `✅ Found ${fallbackResults.length} relevant pages (from fallback fetch):\n${formattedResults}`;
          }
        }

        return `No relevant content found on the website for query: "${query}". Content may need refresh - check scheduled job.`;
      } catch (error) {
        logger.error('❌ Pinecone search failed, falling back to basic search', {
          error: String(error),
        });
      }
    }

    // Ultimate fallback: Direct keyword search (should rarely be used with scheduler)
    logger.warn('⚠️ USING DIRECT KEYWORD SEARCH - Pinecone not available', {
      source: 'WEBSITE_DIRECT_KEYWORD_SEARCH',
    });

    const pageUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);
    const limitedUrls = pageUrls.slice(0, 5); // Limit to avoid timeout

    const pageContents: Array<{ url: string; content: string }> = [];
    const batchSize = 2;

    for (let i = 0; i < limitedUrls.length; i += batchSize) {
      const batch = limitedUrls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async url => {
          try {
            const content = await fetchWebsiteContent(url);
            return { url, content };
          } catch {
            logger.debug('Failed to fetch page', { url });
            return { url, content: '' };
          }
        })
      );
      pageContents.push(...batchResults.filter(page => page.content.length > 0));
    }

    if (pageContents.length === 0) {
      return 'No content could be retrieved from website pages.';
    }

    const queryKeywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);
    const scoredPages = pageContents.map(page => {
      const contentLower = page.content.toLowerCase();
      const matchCount = queryKeywords.reduce((count, keyword) => {
        return count + (contentLower.includes(keyword) ? 1 : 0);
      }, 0);
      return { ...page, score: matchCount };
    });

    const topPages = scoredPages
      .filter(page => page.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (topPages.length === 0) {
      return `No relevant content found on the website for query: "${query}"`;
    }

    const results = topPages
      .map((page, index) => {
        return `\n[Result ${index + 1}] From: ${page.url}\nRelevance Score: ${page.score}\nContent:\n${page.content.substring(0, 800)}...\n`;
      })
      .join('\n---\n');

    return `Found ${topPages.length} relevant page(s) on the website (direct search):\n${results}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Website sitemap search error',
      error instanceof Error ? error : new Error(errorMsg)
    );
    return `Website search encountered an error: ${errorMsg}`;
  }
}

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

async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Router node processing', { questionText: questionText.substring(0, 100) });
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

async function fetchWebsiteNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Website search node: searching sitemap', {
      questionText: questionText.substring(0, 100),
    });
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

async function answerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Answer node: generating response', {
      questionLength: questionText.length,
      hasWebsiteContent: state.websiteContent.length > 0,
    });
    const model = createAgentModel();
    const contextInfo = state.websiteContent
      ? `I have retrieved the following website content for you:\n\n${state.websiteContent}\n\nPlease use this information to answer the question.`
      : 'Use your general knowledge to answer the following question.';
    const systemPrompt = `You are a helpful AI assistant.
${contextInfo}
Answer clearly and concisely.`;
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages.slice(0, -1),
      new HumanMessage(questionText),
    ];
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

function shouldFetchWebsite(_state: AgentState): string {
  try {
    const shouldSearch = config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl;
    return shouldSearch ? 'fetch_website' : 'answer';
  } catch (error) {
    logger.error(
      'Conditional edge error',
      error instanceof Error ? error : new Error(String(error))
    );
    return 'answer';
  }
}

function createLangGraphAgent() {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('router', routerNode)
    .addNode('fetch_website', fetchWebsiteNode)
    .addNode('answer', answerNode)
    .addEdge(START, 'router')
    .addConditionalEdges('router', shouldFetchWebsite)
    .addEdge('fetch_website', 'answer')
    .addEdge('answer', END);
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

function createReactAgentWithTools() {
  const model = createAgentModel();
  const tools = [];
  if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
    tools.push(websiteSearchTool);
    logger.debug('Website search tool added to ReAct agent');
  }
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

export async function processQuestion(question: string, threadId?: string): Promise<string> {
  try {
    logger.debug('Processing question', { question: question.substring(0, 100), threadId });
    const configThreadId = threadId || `thread-${Date.now()}`;
    logger.debug('Config check', {
      websiteSearchEnabled: config.ai.agent.websiteSearchEnabled,
      sitemapUrl: config.ai.agent.sitemapUrl,
      willUseReact: config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl,
    });
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
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() || 'No response generated';
      logger.info('Question processed with ReAct agent', {
        answerLength: answer.length,
        threadId: configThreadId,
      });
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
      const lastMessage = result.messages[result.messages.length - 1];
      const answer = lastMessage?.content?.toString() || 'No response generated';
      logger.info('Question processed with standard agent', {
        answerLength: answer.length,
        threadId: configThreadId,
      });
      return answer;
    }
  } catch (error) {
    logger.error(
      'Process question error',
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

export async function* processQuestionStream(
  question: string,
  threadId?: string
): AsyncGenerator<string> {
  try {
    logger.debug('Processing question with streaming', {
      question: question.substring(0, 100),
      threadId,
    });
    const configThreadId = threadId || `thread-${Date.now()}`;
    const model = createAgentModel();
    if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
      logger.debug('Fetching website content before streaming response');
      const websiteContent = await searchWebsiteSitemap(question);
      const systemPrompt = `You are a helpful AI assistant for customer support.
I have retrieved the following information from the company website:
${websiteContent}
Please use this information to answer the customer's question. Be helpful, professional, and friendly.
Always cite the source URL when using website information.`;
      const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(question)];
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
        threadId: configThreadId,
      });
    } else {
      logger.debug('Streaming response without website search');
      const systemPrompt = `You are a helpful AI assistant. Answer the following question clearly and concisely.`;
      const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(question)];
      const stream = await model.stream(messages);
      for await (const chunk of stream) {
        const content = chunk.content;
        if (typeof content === 'string' && content) {
          yield content;
          logger.debug('Stream chunk yielded', { size: content.length });
        }
      }
      logger.info('Question processed with streaming (no website search)', {
        threadId: configThreadId,
      });
    }
  } catch (error) {
    logger.error(
      'Process question stream error',
      error instanceof Error ? error : new Error(String(error))
    );
    yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export function createSessionAgent(sessionId: string) {
  const conversationHistory: BaseMessage[] = [];
  return {
    async ask(question: string): Promise<string> {
      try {
        logger.debug('Session agent ask', { sessionId, question: question.substring(0, 100) });
        conversationHistory.push(new HumanMessage(question));
        const answer = await processQuestion(question, sessionId);
        conversationHistory.push(new AIMessage(answer));
        return answer;
      } catch (error) {
        logger.error(
          'Session agent ask error',
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      }
    },

    async *askStream(question: string): AsyncGenerator<string> {
      try {
        logger.debug('Session agent ask stream', {
          sessionId,
          question: question.substring(0, 100),
        });
        conversationHistory.push(new HumanMessage(question));
        let fullAnswer = '';
        for await (const chunk of processQuestionStream(question, sessionId)) {
          fullAnswer += chunk;
          yield chunk;
        }
        conversationHistory.push(new AIMessage(fullAnswer));
      } catch (error) {
        logger.error(
          'Session agent ask stream error',
          error instanceof Error ? error : new Error(String(error))
        );
        yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    getHistory(): BaseMessage[] {
      return conversationHistory;
    },

    clearHistory(): void {
      conversationHistory.length = 0;
      logger.debug('Session history cleared', { sessionId });
    },
  };
}
