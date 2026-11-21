export type CreationKind = 'film' | 'text' | 'character';

export type Locale = 'en' | 'zh';

export type WorkspaceView = 'chat' | 'brief' | 'studio';

export type SortMode = 'updated' | 'created' | 'title';

export type LLMProvider =
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'qwen'
  | 'siliconflow'
  | 'ollama'
  | 'custom';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  updatedFields?: string[];
}

export interface CreativeBrief {
  title: string;
  summary: string;
  coreExperience: string;
  tone: string;
  audience: string;
  keyElements: string[];
  details: Record<string, string>;
  authoring: Record<string, string>;
  suggestedFields: string[];
}

export interface StoryChoice {
  id: string;
  label: string;
  targetNodeId: string;
  consequence?: string;
}

export interface StoryNode {
  id: string;
  title: string;
  type: 'opening' | 'scene' | 'branch' | 'ending';
  setting: string;
  narrative: string;
  visualCue: string;
  choices: StoryChoice[];
}

export interface Discussion {
  id: string;
  kind: CreationKind;
  kindSelected: boolean;
  kindLocked: boolean;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  brief: CreativeBrief;
  suggestedReplies: string[];
  studioNodes: StoryNode[];
  studioCreated: boolean;
}

export interface LLMConfig {
  enabled: boolean;
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  apiKeyMasked?: string;
}

export interface UserAccount {
  signedIn: boolean;
  name: string;
  email: string;
  credits: number;
}
