import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'workspace-db.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const PORT = Number(process.env.PORT || 3001);

const DEFAULT_CONFIG = {
  enabled: false,
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY || '',
  model: 'gpt-4o-mini',
};

const DEFAULT_DB = {
  account: {
    signedIn: true,
    name: 'Yino',
    email: 'creator@dramafork.local',
    credits: 25,
  },
  discussions: [],
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJson(filePath, data) {
  await ensureDataDir();
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

async function getConfig() {
  const cfg = await readJson(CONFIG_PATH, DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...cfg };
}

function sanitizeConfig(cfg) {
  return {
    enabled: Boolean(cfg.enabled),
    provider: cfg.provider || 'openai',
    baseUrl: cfg.baseUrl || '',
    model: cfg.model || '',
    hasApiKey: Boolean(cfg.apiKey && cfg.apiKey.trim()),
    apiKeyMasked: cfg.apiKey
      ? cfg.apiKey.length > 8
        ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}`
        : '••••••••'
      : '',
  };
}

function canUseLiveLLM(cfg) {
  if (!cfg.enabled || !cfg.baseUrl?.trim()) return false;
  // Ollama / local endpoints may not require an API key
  if (cfg.provider === 'ollama' || cfg.baseUrl.includes('localhost') || cfg.baseUrl.includes('127.0.0.1')) {
    return true;
  }
  return Boolean(cfg.apiKey && cfg.apiKey.trim());
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function initSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildLLMHeaders(cfg) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey?.trim()) {
    headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
  }
  return headers;
}

async function callLLMJson(cfg, messages, temperature = 0.7) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: cfg.model || 'gpt-4o-mini',
    temperature,
    messages,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildLLMHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return extractJsonFromText(content);
}

function extractJsonFromText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      return JSON.parse(fence[1].trim());
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON');
  }
}

async function streamLLMText(cfg, messages, onDelta, temperature = 0.75) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildLLMHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o-mini',
      temperature,
      stream: true,
      messages,
    }),
  });
  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM Stream HTTP ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
  return fullText;
}

// ===== Fallback Local Creative Helpers (when no live LLM configured) =====
const REQUIRED_BY_KIND = {
  film: ['summary', 'protagonist', 'conflict', 'setting', 'tone', 'coreExperience', 'keyChoice'],
  text: ['summary', 'playerRole', 'tone', 'coreExperience', 'coreLoop', 'mechanics'],
  character: ['summary', 'identity', 'goal', 'tone', 'playerRole', 'relationship', 'coreExperience', 'boundaries'],
};

function getFieldVal(brief, key) {
  if (!brief) return '';
  if (key === 'keyElements') return Array.isArray(brief.keyElements) ? brief.keyElements.join(', ') : '';
  if (['summary', 'coreExperience', 'tone', 'audience', 'title'].includes(key)) {
    return String(brief[key] || '').trim();
  }
  return String(brief.details?.[key] || brief.authoring?.[key] || '').trim();
}

function applyUpdatesToBrief(brief, updates = {}, title) {
  const next = {
    title: brief.title || '',
    summary: brief.summary || '',
    coreExperience: brief.coreExperience || '',
    tone: brief.tone || '',
    audience: brief.audience || '',
    keyElements: Array.isArray(brief.keyElements) ? [...brief.keyElements] : [],
    details: { ...(brief.details || {}) },
    authoring: { ...(brief.authoring || {}) },
    suggestedFields: Array.isArray(brief.suggestedFields) ? [...brief.suggestedFields] : [],
  };
  const updatedFields = [];
  if (typeof title === 'string' && title.trim()) {
    next.title = title.trim();
  }
  const rootKeys = new Set(['summary', 'coreExperience', 'tone', 'audience']);
  const authoringKeys = new Set([
    'textMode',
    'openingNarrative',
    'language',
    'age',
    'category',
    'openingMessage',
    'traits',
    'coreValues',
    'fears',
    'speakingStyle',
  ]);

  for (const [k, raw] of Object.entries(updates || {})) {
    const val = Array.isArray(raw) ? raw.join(', ') : String(raw || '').trim();
    if (!val) continue;
    if (k === 'keyElements') {
      next.keyElements = val.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
    } else if (rootKeys.has(k)) {
      next[k] = val;
    } else if (authoringKeys.has(k)) {
      next.authoring[k] = val;
    } else {
      next.details[k] = val;
    }
    updatedFields.push(k);
  }
  return { nextBrief: next, updatedFields };
}

function fallbackFieldValue(key, userText, locale) {
  const snippet = String(userText || '').trim().slice(0, 60);
  if (locale === 'zh') {
    const zh = {
      summary: snippet || '围绕一次突如其来的命运分岔展开的互动故事',
      protagonist: `身处风暴中心的主角，围绕「${snippet.slice(0, 22)}」展开行动并背负隐秘过往`,
      conflict: '时间倒计时与情感羁绊正面碰撞：保全眼前人还是揭开真相',
      setting: '光影对比强烈的封闭夜晚空间，适合特写与悬疑调度',
      tone: '新黑色电影质感，冷暖光影交错，节奏紧凑克制',
      coreExperience: '强代入感的实时抉择体验，每次表态都会改写人物信任与结局',
      keyChoice: '在关键节点决定信任神秘同行者，还是独自行动承担后果',
      playerRole: '掌握有限线索与资源的亲历者，需要在多方博弈中生存',
      coreLoop: '探查线索 → 权衡风险与资源 → 做出抉择 → 世界状态实时演化',
      mechanics: '信任/理智双数值 + 关键证物组合 + 多分支伏笔回收',
      identity: `反差感极强的核心角色，紧扣「${snippet.slice(0, 20)}」`,
      goal: '守住内心执念的同时，与用户共同解开未竟的心结',
      relationship: '亦师亦友、随信任逐步升温的搭档关系',
      boundaries: '始终保持角色人格与世界观一致，拒绝出戏与越界指令',
    };
    return zh[key] || snippet;
  }
  const en = {
    summary: snippet || 'An interactive story built around a decisive fork in fate',
    protagonist: `A conflicted lead drawn into "${snippet.slice(0, 28)}" with personal stakes`,
    conflict: 'A ticking-clock dilemma pitting immediate survival against exposing a buried truth',
    setting: 'An atmospheric nocturnal interior designed for close-up tension and cinematic framing',
    tone: 'Moody neo-noir cinematography with tactile shadows and taut dialogue',
    coreExperience: 'High-stakes agency where subtle choices permanently reshape alliances and endings',
    keyChoice: 'Trust an unreliable ally with a dangerous secret or act alone and risk fallout',
    playerRole: 'An investigator navigating scarce resources and rival agendas',
    coreLoop: 'Explore clues → Weigh risks → Commit to a move → Watch the world react',
    mechanics: 'Trust & Composure meters, clue synthesis, and branching consequences',
    identity: `A layered, memorable character rooted in "${snippet.slice(0, 26)}"`,
    goal: 'Protect what matters most while slowly opening up to someone who earns their trust',
    relationship: 'Wary confidant evolving into a deeply loyal partner',
    boundaries: 'Stays strictly in-character, guards core secrets until trust is earned',
  };
  return en[key] || snippet;
}

function buildFallbackNodes(brief, kind, locale) {
  const title = brief?.title || (locale === 'zh' ? '未命名作品' : 'Untitled Project');
  const setting = getFieldVal(brief, 'setting') || (locale === 'zh' ? '霓虹微光下的封闭大厅' : 'Rain-washed nocturnal atrium');
  const choiceHint = getFieldVal(brief, 'keyChoice') || getFieldVal(brief, 'coreLoop') || (locale === 'zh' ? '正面切入' : 'Step forward');

  if (locale === 'zh') {
    return [
      {
        id: 'node-open',
        title: '01 · 序幕引入',
        type: 'opening',
        setting,
        visualCue: '缓慢推近 · 冷色逆光与低频环境音',
        narrative: `【${title}】正式开场。${brief?.summary || '深夜时分，一条异常讯号打破了沉寂。'} 倒计时已经开始，你的第一个决定将直接改写局势。`,
        choices: [
          { id: 'c1', label: `直面核心：${choiceHint.slice(0, 24)}`, targetNodeId: 'node-branch-a', consequence: '信任 +1 · 暴露行踪' },
          { id: 'c2', label: '按兵不动，先暗中收集关键线索', targetNodeId: 'node-branch-b', consequence: '洞察 +1 · 消耗时间' },
        ],
      },
      {
        id: 'node-branch-a',
        title: '02A · 正面交锋',
        type: 'branch',
        setting: '狭窄走廊 · 灯光闪烁的交汇点',
        visualCue: '手持跟拍 · 极近特写',
        narrative: '对方似乎早有预料，递出一枚加密信物，并压低声音告诉你真正的幕后操盘者正在监听这段对话。',
        choices: [
          { id: 'c3', label: '接过信物，结成危险同盟', targetNodeId: 'node-end-truth', consequence: '开启真相结局' },
          { id: 'c4', label: '当场拆穿破绽并强行撤离', targetNodeId: 'node-end-solo', consequence: '开启孤狼结局' },
        ],
      },
      {
        id: 'node-branch-b',
        title: '02B · 暗室追踪',
        type: 'branch',
        setting: '档案暗格与监控终端',
        visualCue: '俯拍广角 · 蓝光映照',
        narrative: '你在被删改的日志里还原出零点坐标，同时也发现了某个熟悉的名字。',
        choices: [
          { id: 'c5', label: '带着证据直奔零点现场', targetNodeId: 'node-end-truth', consequence: '解锁真相结局' },
          { id: 'c6', label: '匿名公开日志，彻底掀翻棋局', targetNodeId: 'node-end-solo', consequence: '解锁反转结局' },
        ],
      },
      {
        id: 'node-end-truth',
        title: '结局 A · 黎明真相',
        type: 'ending',
        setting: '晨雾散去的城市天台',
        visualCue: '暖色破晓光 · 弦乐渐起',
        narrative: '所有伏笔在天亮前严丝合缝地拼合。你改写了既定的结局，而新的信号又在远方亮起。',
        choices: [],
      },
      {
        id: 'node-end-solo',
        title: '结局 B · 孤注一掷',
        type: 'ending',
        setting: '雨停后的空旷长街',
        visualCue: '长镜头拉远 · 留白余韵',
        narrative: '你全身而退，但屏幕上那条未读留言提醒着你：这场棋局远未结束。',
        choices: [],
      },
    ];
  }

  return [
    {
      id: 'node-open',
      title: '01 · Opening Hook',
      type: 'opening',
      setting,
      visualCue: 'Slow push-in · Cool rim light, low ambient pulse',
      narrative: `${title} opens. ${brief?.summary || 'An unexpected signal shatters the quiet night.'} The clock is ticking and your first move locks in the trajectory.`,
      choices: [
        { id: 'c1', label: `Confront directly: ${choiceHint.slice(0, 30)}`, targetNodeId: 'node-branch-a', consequence: 'Trust +1 · Cover blown' },
        { id: 'c2', label: 'Hold back and gather hidden leverage', targetNodeId: 'node-branch-b', consequence: 'Insight +1 · Time lost' },
      ],
    },
    {
      id: 'node-branch-a',
      title: '02A · Direct Confrontation',
      type: 'branch',
      setting: 'Dim corridor under flickering lamps',
      visualCue: 'Handheld close-up · Tight framing',
      narrative: 'They expected you. They slide a numbered token across the table and warn that someone else is listening.',
      choices: [
        { id: 'c3', label: 'Accept the token and form a fragile pact', targetNodeId: 'node-end-truth', consequence: 'Truth Ending' },
        { id: 'c4', label: 'Call their bluff and walk out now', targetNodeId: 'node-end-solo', consequence: 'Lone Wolf Ending' },
      ],
    },
    {
      id: 'node-branch-b',
      title: '02B · Shadow Investigation',
      type: 'branch',
      setting: 'Back-room terminal in blue monitor glow',
      visualCue: 'High-angle wide shot · Cool reflections',
      narrative: 'Inside a purged log you recover a midnight coordinate—and a name you never expected to see.',
      choices: [
        { id: 'c5', label: 'Race to the midnight coordinate with proof', targetNodeId: 'node-end-truth', consequence: 'Truth Ending' },
        { id: 'c6', label: 'Leak the log anonymously and flip the board', targetNodeId: 'node-end-solo', consequence: 'Twist Ending' },
      ],
    },
    {
      id: 'node-end-truth',
      title: 'Ending A · Dawn Revelation',
      type: 'ending',
      setting: 'Rooftop overlooking the clearing skyline',
      visualCue: 'Warm sunrise rim light · Swelling strings',
      narrative: 'Every fragment locks together before sunrise. You rewrote the inevitable outcome—leaving one mystery humming on the horizon.',
      choices: [],
    },
    {
      id: 'node-end-solo',
      title: 'Ending B · Calculated Escape',
      type: 'ending',
      setting: 'Empty rain-washed avenue at 4 AM',
      visualCue: 'Slow pull-back wide shot · Quiet resonance',
      narrative: 'You walk away intact, but one unanswered message on your screen makes it clear the real game has just begun.',
      choices: [],
    },
  ];
}

// ===== HTTP Route Handlers =====
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  const urlObj = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = urlObj.pathname;

  try {
    // 1. Workspace State (DB + sanitized config)
    if (req.method === 'GET' && pathname === '/api/state') {
      const [db, cfg] = await Promise.all([
        readJson(DB_PATH, DEFAULT_DB),
        getConfig(),
      ]);
      return sendJson(res, 200, {
        account: db.account || DEFAULT_DB.account,
        discussions: Array.isArray(db.discussions) ? db.discussions : [],
        llm: sanitizeConfig(cfg),
        liveReady: canUseLiveLLM(cfg),
      });
    }

    if (req.method === 'PUT' && pathname === '/api/state') {
      const body = await parseBody(req);
      const db = await readJson(DB_PATH, DEFAULT_DB);
      if (body.account) db.account = body.account;
      if (Array.isArray(body.discussions)) db.discussions = body.discussions;
      await writeJson(DB_PATH, db);
      return sendJson(res, 200, { ok: true });
    }

    // 2. LLM Config & Test
    if (req.method === 'GET' && pathname === '/api/config') {
      const cfg = await getConfig();
      return sendJson(res, 200, { llm: sanitizeConfig(cfg), liveReady: canUseLiveLLM(cfg) });
    }

    if (req.method === 'PUT' && pathname === '/api/config') {
      const body = await parseBody(req);
      const current = await getConfig();
      const next = {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
        provider: body.provider || current.provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : current.baseUrl,
        model: typeof body.model === 'string' ? body.model.trim() : current.model,
        // Keep existing key if user left apiKey blank
        apiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : current.apiKey,
      };
      if (body.clearApiKey) next.apiKey = '';
      await writeJson(CONFIG_PATH, next);
      return sendJson(res, 200, {
        ok: true,
        llm: sanitizeConfig(next),
        liveReady: canUseLiveLLM(next),
      });
    }

    if (req.method === 'POST' && pathname === '/api/config/test') {
      const body = await parseBody(req);
      const current = await getConfig();
      const testCfg = {
        enabled: true,
        provider: body.provider || current.provider,
        baseUrl: (body.baseUrl || current.baseUrl || '').trim(),
        model: (body.model || current.model || '').trim(),
        apiKey: (body.apiKey || current.apiKey || '').trim(),
      };
      if (!testCfg.baseUrl) {
        return sendJson(res, 400, { ok: false, error: 'Missing Base URL' });
      }
      const start = Date.now();
      const url = `${testCfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: buildLLMHeaders(testCfg),
        body: JSON.stringify({
          model: testCfg.model || 'gpt-4o-mini',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply with OK' }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return sendJson(res, 200, {
          ok: false,
          error: `HTTP ${resp.status}: ${errText.slice(0, 220)}`,
        });
      }
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content || 'OK';
      return sendJson(res, 200, {
        ok: true,
        latencyMs: Date.now() - start,
        reply: String(reply).trim(),
      });
    }

    // 3. SSE Streaming Creative Chat + Automatic Brief Extraction
    if (req.method === 'POST' && pathname === '/api/ai/chat/stream') {
      const body = await parseBody(req);
      const { kind = 'film', brief = {}, userMessage = '', history = [], locale = 'en' } = body;
      const cfg = await getConfig();
      initSSE(res);

      const requiredKeys = REQUIRED_BY_KIND[kind] || REQUIRED_BY_KIND.film;
      const missingBefore = requiredKeys.filter((k) => !getFieldVal(brief, k));

      if (canUseLiveLLM(cfg)) {
        try {
          sendSSE(res, 'meta', { mode: 'live', model: cfg.model });
          const langName = locale === 'zh' ? 'Simplified Chinese' : 'English';
          const directorSys = `You are DramaFork's creative director helping the user shape a ${kind} project.
Respond warmly, concisely (2-4 sentences), in ${langName}.
Acknowledge their concrete idea and ask 1 focused follow-up question targeting the most important missing brief fields: ${missingBefore.slice(0, 2).join(', ') || 'optional polish'}.
Do NOT output JSON in this message; write natural conversational prose.`;

          const replyText = await streamLLMText(
            cfg,
            [
              { role: 'system', content: directorSys },
              ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage },
            ],
            (delta) => sendSSE(res, 'delta', { text: delta }),
          );

          // Structured Brief extraction pass
          const extractSys = `Extract structured creative brief updates for a ${kind} project based on the user's latest message and director reply.
Return ONLY valid JSON:
{
  "title": "concise project title if inferable else empty string",
  "updates": { "<fieldKey>": "concise extracted value in ${langName}" },
  "suggestedReplies": ["3 short follow-up reply ideas the user can click next in ${langName}"]
}
Allowed keys: ${requiredKeys.join(', ')}, theme, endingCount, characterCount, durationTarget, audience, keyElements, openingNarrative, openingMessage, traits.
Only include keys that are newly informed or refined by the conversation. Current brief: ${JSON.stringify(brief)}`;

          let extracted = { title: '', updates: {}, suggestedReplies: [] };
          try {
            extracted = await callLLMJson(
              cfg,
              [
                { role: 'system', content: extractSys },
                { role: 'user', content: `User: ${userMessage}\nDirector: ${replyText}` },
              ],
              0.3,
            );
          } catch {
            // keep empty extraction if model returned non-json
          }

          const { nextBrief, updatedFields } = applyUpdatesToBrief(
            brief,
            extracted.updates,
            extracted.title,
          );
          sendSSE(res, 'brief', {
            brief: nextBrief,
            updatedFields,
            suggestedReplies: Array.isArray(extracted.suggestedReplies)
              ? extracted.suggestedReplies.slice(0, 3)
              : [],
          });
          sendSSE(res, 'done', { mode: 'live', reply: replyText });
          return res.end();
        } catch (err) {
          sendSSE(res, 'error', { message: err.message || 'Live LLM call failed' });
          return res.end();
        }
      }

      // Built-in Demo Streaming Engine (when live LLM is not configured)
      sendSSE(res, 'meta', { mode: 'demo', model: 'built-in-director' });
      const updates = {};
      const batch = missingBefore.slice(0, history.length === 0 ? 3 : 2);
      batch.forEach((k, idx) => {
        updates[k] = idx === 0 ? userMessage.trim() : fallbackFieldValue(k, userMessage, locale);
      });
      if (batch.length === 0) {
        updates[kind === 'film' ? 'extraRequirements' : kind === 'text' ? 'openingNarrative' : 'openingMessage'] =
          userMessage.trim();
      }
      const derivedTitle =
        brief.title ||
        userMessage.trim().split(/[。！？.!?:：;；,，]/)[0].slice(0, 26) ||
        (locale === 'zh' ? '午夜分岔口' : 'The Midnight Fork');

      const { nextBrief, updatedFields } = applyUpdatesToBrief(brief, updates, derivedTitle);
      const remainingAfter = requiredKeys.filter((k) => !getFieldVal(nextBrief, k));

      const replyText =
        remainingAfter.length === 0
          ? locale === 'zh'
            ? `太棒了！全部核心设定已经整理完毕并同步到「简报」中。你可以点击顶部「简报」微调细节，或直接启动 Studio 制片台生成可游玩分支！（提示：在左下角设置中填入 API Key 即可切换为真实大模型实时驱动）`
            : `Awesome! All essential fields are now synced to your Brief. Review them in the Brief tab or launch straight into Studio to generate and playtest your interactive graph! (Tip: add an API key in Settings for live LLM generation.)`
          : locale === 'zh'
            ? `很有画面感的想法！我已经把相关核心设定同步写入简报（已完成 ${requiredKeys.length - remainingAfter.length}/${requiredKeys.length}）。接下来聊聊「${remainingAfter[0]}」：你希望这里呈现怎样的戏剧张力？`
            : `Strong creative hook! I've synced those details into your brief (${requiredKeys.length - remainingAfter.length}/${requiredKeys.length} confirmed). Next up is "${remainingAfter[0]}" — what kind of tension or player feeling are you aiming for?`;

      // Simulate smooth token streaming
      const chunks = replyText.match(/.{1,4}/g) || [replyText];
      for (const ch of chunks) {
        sendSSE(res, 'delta', { text: ch });
        await new Promise((r) => setTimeout(r, 18));
      }

      const suggestedReplies =
        locale === 'zh'
          ? [
              '加入一个高风险倒计时抉择，让每个决定都不可逆',
              '整体基调偏暗黑悬疑电影感，对白克制利落',
              '请按你的最佳创意帮我补齐剩余设定',
            ]
          : [
              'Add a high-stakes ticking-clock dilemma with irreversible fallout',
              'Keep the tone moody and cinematic with crisp, restrained dialogue',
              'Go ahead and pitch the remaining essentials for me',
            ];

      sendSSE(res, 'brief', { brief: nextBrief, updatedFields, suggestedReplies });
      sendSSE(res, 'done', { mode: 'demo', reply: replyText });
      return res.end();
    }

    // 4. AI Auto-Complete Brief
    if (req.method === 'POST' && pathname === '/api/ai/brief/complete') {
      const { kind = 'film', brief = {}, messages = [], locale = 'en' } = await parseBody(req);
      const cfg = await getConfig();
      const requiredKeys = REQUIRED_BY_KIND[kind] || REQUIRED_BY_KIND.film;
      const missing = requiredKeys.filter((k) => !getFieldVal(brief, k));

      if (canUseLiveLLM(cfg)) {
        const langName = locale === 'zh' ? 'Simplified Chinese' : 'English';
        const sys = `You are a senior narrative designer for DramaFork.
Fill in all missing required brief fields for this ${kind} project in ${langName}, keeping full coherence with existing fields and chat history.
Return ONLY valid JSON:
{
  "title": "compelling project title",
  "updates": { "<fieldKey>": "vivid, concrete value" }
}
Missing required fields: ${missing.join(', ')}.
Also optionally enrich 1-2 production fields (theme, endingCount, durationTarget, traits, openingMessage, textMode).
Current brief: ${JSON.stringify(brief)}`;

        const parsed = await callLLMJson(
          cfg,
          [
            { role: 'system', content: sys },
            { role: 'user', content: JSON.stringify(messages.slice(-6)) },
          ],
          0.75,
        );
        const { nextBrief, updatedFields } = applyUpdatesToBrief(brief, parsed.updates, parsed.title);
        nextBrief.suggestedFields = Array.from(new Set([...nextBrief.suggestedFields, ...updatedFields]));
        return sendJson(res, 200, { mode: 'live', brief: nextBrief, updatedFields });
      }

      const updates = {};
      const seed = brief.summary || brief.title || (locale === 'zh' ? '午夜分岔口' : 'The Midnight Fork');
      for (const k of missing) {
        updates[k] = fallbackFieldValue(k, seed, locale);
      }
      const { nextBrief, updatedFields } = applyUpdatesToBrief(
        brief,
        updates,
        brief.title || (locale === 'zh' ? '午夜分岔口' : 'The Midnight Fork'),
      );
      nextBrief.suggestedFields = Array.from(new Set([...nextBrief.suggestedFields, ...updatedFields]));
      return sendJson(res, 200, { mode: 'demo', brief: nextBrief, updatedFields });
    }

    // 5. AI Studio Graph Generation
    if (req.method === 'POST' && pathname === '/api/ai/studio/generate') {
      const { kind = 'film', brief = {}, locale = 'en' } = await parseBody(req);
      const cfg = await getConfig();

      if (canUseLiveLLM(cfg)) {
        const langName = locale === 'zh' ? 'Simplified Chinese' : 'English';
        const sys = `Generate an interactive branching scene graph in ${langName} for this ${kind} brief.
Return ONLY valid JSON with exact shape:
{
  "nodes": [
    {
      "id": "node-1",
      "title": "01 · Scene Title",
      "type": "opening" | "branch" | "scene" | "ending",
      "setting": "concise location",
      "visualCue": "camera angle, lighting, sound cue",
      "narrative": "vivid 2-4 sentence dramatic scene beat",
      "choices": [
        { "id": "c1", "label": "player choice text", "targetNodeId": "node-2", "consequence": "short impact tag" }
      ]
    }
  ]
}
Requirements:
- Create 5 to 6 connected nodes: 1 opening, 2-3 branching scenes, and 2 distinct endings.
- Every choice's targetNodeId MUST reference an existing node id in the array.
- Ending nodes must have an empty choices array [].
Brief: ${JSON.stringify(brief)}`;

        const parsed = await callLLMJson(cfg, [{ role: 'system', content: sys }], 0.8);
        if (Array.isArray(parsed.nodes) && parsed.nodes.length >= 2) {
          return sendJson(res, 200, { mode: 'live', nodes: parsed.nodes });
        }
      }

      return sendJson(res, 200, {
        mode: 'demo',
        nodes: buildFallbackNodes(brief, kind, locale),
      });
    }

    // 6. AI Expand Single Studio Node
    if (req.method === 'POST' && pathname === '/api/ai/studio/expand-node') {
      const { kind = 'film', brief = {}, node = {}, locale = 'en' } = await parseBody(req);
      const cfg = await getConfig();

      if (canUseLiveLLM(cfg)) {
        const langName = locale === 'zh' ? 'Simplified Chinese' : 'English';
        const sys = `Polish and expand this single interactive ${kind} scene node in ${langName} with richer cinematic detail, stronger subtext, and punchier visual direction.
Return ONLY valid JSON:
{
  "title": "string",
  "setting": "string",
  "visualCue": "string",
  "narrative": "vivid 3-5 sentence scene with dialogue and atmosphere"
}
Brief: ${JSON.stringify(brief)}
Current node: ${JSON.stringify(node)}`;
        const parsed = await callLLMJson(cfg, [{ role: 'system', content: sys }], 0.8);
        return sendJson(res, 200, {
          mode: 'live',
          patch: {
            title: parsed.title || node.title,
            setting: parsed.setting || node.setting,
            visualCue: parsed.visualCue || node.visualCue,
            narrative: parsed.narrative || node.narrative,
          },
        });
      }

      const expanded =
        locale === 'zh'
          ? `${node.narrative}\n\n灯光微微一暗，远处的低频声响逼近。你注意到对方指尖微微收紧——这一刻的沉默，比任何台词都更接近真相。`
          : `${node.narrative}\n\nThe overhead light flickers once. You catch the slight tremor in their hand—in this room, hesitation speaks louder than any confession.`;
      return sendJson(res, 200, {
        mode: 'demo',
        patch: {
          narrative: expanded,
          visualCue: `${node.visualCue} · Dramatic pause`,
        },
      });
    }

    // 7. SSE Live Play Engine (Character IP Roleplay & Text Game Dynamic AI)
    if (req.method === 'POST' && pathname === '/api/ai/play/stream') {
      const { kind = 'character', brief = {}, history = [], playerInput = '', locale = 'en' } = await parseBody(req);
      const cfg = await getConfig();
      initSSE(res);

      if (canUseLiveLLM(cfg)) {
        try {
          const langName = locale === 'zh' ? 'Simplified Chinese' : 'English';
          const sys =
            kind === 'character'
              ? `Roleplay strictly in-character in ${langName} based on this Character IP brief. Stay immersive, expressive, and respect boundaries. Do not break character.\nBrief: ${JSON.stringify(brief)}`
              : `You are the live interactive game master for a Text Game in ${langName}. Narrate the immediate consequence of the player's action in 2-4 vivid sentences, update mood/stakes, and end with 2 concise suggested next actions.\nBrief: ${JSON.stringify(brief)}`;

          const full = await streamLLMText(
            cfg,
            [
              { role: 'system', content: sys },
              ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
              { role: 'user', content: playerInput },
            ],
            (delta) => sendSSE(res, 'delta', { text: delta }),
            0.85,
          );
          sendSSE(res, 'done', { mode: 'live', reply: full });
          return res.end();
        } catch (err) {
          sendSSE(res, 'error', { message: err.message || 'Live play failed' });
          return res.end();
        }
      }

      const demoReply =
        kind === 'character'
          ? locale === 'zh'
            ? `（轻声一笑，目光停在你身上）“${playerInput.slice(0, 20)}”……真有意思，很少有人会这样直白地问我。既然你开口了，不妨告诉我，你真正想找的答案是什么？`
            : `(A quiet pause, studying your expression) "${playerInput.slice(0, 24)}"... Most people hesitate before going there. Tell me—what are you actually hoping to uncover tonight?`
          : locale === 'zh'
            ? `你执行了「${playerInput}」。周围局势立刻发生变化：一道新的线索浮出水面，同时隐藏的风险也在逼近。\n\n接下来你可以：\n1. 顺着新线索深入调查\n2. 立刻撤退并重新评估局势`
            : `You act on "${playerInput}". The room shifts immediately—a fresh lead surfaces, while an unseen timer ticks closer.\n\nNext moves:\n1. Follow the new lead deeper\n2. Pull back and reassess your leverage`;

      for (const ch of demoReply.match(/.{1,4}/g) || [demoReply]) {
        sendSSE(res, 'delta', { text: ch });
        await new Promise((r) => setTimeout(r, 16));
      }
      sendSSE(res, 'done', { mode: 'demo', reply: demoReply });
      return res.end();
    }

    // 8. Static frontend hosting from dist/ (for production single-port deployment)
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      const distDir = path.join(ROOT_DIR, 'dist');
      const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const targetPath = path.resolve(distDir, relPath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.json': 'application/json; charset=utf-8',
        '.ico': 'image/x-icon',
      };
      try {
        if (targetPath.startsWith(distDir)) {
          const stat = await fs.stat(targetPath);
          if (stat.isFile()) {
            const buf = await fs.readFile(targetPath);
            const ext = path.extname(targetPath).toLowerCase();
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            return res.end(buf);
          }
        }
      } catch {
        // fall through to SPA index.html
      }
      try {
        const indexHtml = await fs.readFile(path.join(distDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(indexHtml);
      } catch {
        // dist not built yet
      }
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[DramaFork API] listening on http://127.0.0.1:${PORT}`);
});
