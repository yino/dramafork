import {
  CreationKind,
  CreativeBrief,
  Discussion,
  LLMConfig,
  Locale,
  StoryNode,
  UserAccount,
} from '../types';

export interface WorkspaceStateResponse {
  account: UserAccount;
  discussions: Discussion[];
  llm: LLMConfig;
  liveReady: boolean;
}

async function parseSSEStream(
  response: Response,
  handlers: {
    onEvent: (event: string, data: Record<string, unknown>) => void;
  },
) {
  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `HTTP ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      let eventName = 'message';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      try {
        handlers.onEvent(eventName, JSON.parse(dataStr));
      } catch {
        // ignore parse errors
      }
    }
  }
}

export async function fetchWorkspaceState(): Promise<WorkspaceStateResponse> {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error(`Failed to load state (${res.status})`);
  return res.json();
}

export async function saveWorkspaceState(payload: {
  account: UserAccount;
  discussions: Discussion[];
}): Promise<void> {
  await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function saveLLMConfig(config: LLMConfig & { clearApiKey?: boolean }): Promise<{
  ok: boolean;
  llm: LLMConfig;
  liveReady: boolean;
}> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Failed to save config (${res.status})`);
  return res.json();
}

export async function testLLMConnection(config: Partial<LLMConfig>): Promise<{
  ok: boolean;
  latencyMs?: number;
  reply?: string;
  error?: string;
}> {
  const res = await fetch('/api/config/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function streamCreativeChat(
  params: {
    kind: CreationKind;
    brief: CreativeBrief;
    userMessage: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    locale: Locale;
  },
  callbacks: {
    onDelta: (text: string) => void;
    onBrief: (payload: {
      brief: CreativeBrief;
      updatedFields: string[];
      suggestedReplies: string[];
    }) => void;
    onDone: (payload: { mode: string; reply: string }) => void;
    onError: (message: string) => void;
  },
) {
  const res = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  await parseSSEStream(res, {
    onEvent: (event, data) => {
      if (event === 'delta' && typeof data.text === 'string') {
        callbacks.onDelta(data.text);
      } else if (event === 'brief') {
        callbacks.onBrief({
          brief: data.brief as CreativeBrief,
          updatedFields: (data.updatedFields as string[]) || [],
          suggestedReplies: (data.suggestedReplies as string[]) || [],
        });
      } else if (event === 'done') {
        callbacks.onDone({
          mode: String(data.mode || 'demo'),
          reply: String(data.reply || ''),
        });
      } else if (event === 'error') {
        callbacks.onError(String(data.message || 'AI request failed'));
      }
    },
  });
}

export async function aiCompleteBrief(params: {
  kind: CreationKind;
  brief: CreativeBrief;
  messages: { role: string; content: string }[];
  locale: Locale;
}): Promise<{ mode: string; brief: CreativeBrief; updatedFields: string[] }> {
  const res = await fetch('/api/ai/brief/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function aiGenerateStudioNodes(params: {
  kind: CreationKind;
  brief: CreativeBrief;
  locale: Locale;
}): Promise<{ mode: string; nodes: StoryNode[] }> {
  const res = await fetch('/api/ai/studio/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function aiExpandStudioNode(params: {
  kind: CreationKind;
  brief: CreativeBrief;
  node: StoryNode;
  locale: Locale;
}): Promise<{ mode: string; patch: Partial<StoryNode> }> {
  const res = await fetch('/api/ai/studio/expand-node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function streamLivePlay(
  params: {
    kind: CreationKind;
    brief: CreativeBrief;
    history: { role: 'user' | 'assistant'; content: string }[];
    playerInput: string;
    locale: Locale;
  },
  callbacks: {
    onDelta: (text: string) => void;
    onDone: (reply: string) => void;
    onError: (msg: string) => void;
  },
) {
  const res = await fetch('/api/ai/play/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  await parseSSEStream(res, {
    onEvent: (event, data) => {
      if (event === 'delta' && typeof data.text === 'string') {
        callbacks.onDelta(data.text);
      } else if (event === 'done') {
        callbacks.onDone(String(data.reply || ''));
      } else if (event === 'error') {
        callbacks.onError(String(data.message || 'Play request failed'));
      }
    },
  });
}
