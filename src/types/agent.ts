import { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  }),
  websiteContent: Annotation<string>({
    reducer: (_x: string, y: string) => y || _x,
    default: () => '',
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

export interface SessionAgent {
  ask: (question: string) => Promise<string>;
  askStream: (question: string) => AsyncGenerator<string, void, unknown>;
  getHistory: () => BaseMessage[];
  clearHistory: () => void;
}

export interface AgentConfig {
  sessionId: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
