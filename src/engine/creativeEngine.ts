import {
  CreationKind,
  CreativeBrief,
  LLMConfig,
  Locale,
  StoryNode,
} from '../types';
import {
  getBriefFieldValue,
  getBriefProgress,
  getRequiredFieldKeys,
  setBriefFieldValue,
} from '../data/schema';
import { fieldLabel } from '../data/i18n';

export interface EngineTurnResult {
  reply: string;
  nextBrief: CreativeBrief;
  updatedFields: string[];
  suggestedReplies: string[];
}

function deriveTitle(text: string, kind: CreationKind, locale: Locale): string {
  const clean = text.replace(/[\r\n]+/g, ' ').trim();
  const quoted = clean.match(/[《「“"]([^》」”"]{2,26})[》」”"]/);
  if (quoted) return quoted[1];
  const firstClause = clean.split(/[。！？.!?:：;；,，]/)[0].trim();
  if (firstClause.length >= 3 && firstClause.length <= 28) {
    return firstClause;
  }
  if (firstClause.length > 28) {
    return firstClause.slice(0, 24).trim() + '…';
  }
  if (locale === 'zh') {
    return kind === 'film' ? '未命名影游计划' : kind === 'text' ? '未命名文游世界' : '未命名角色档案';
  }
  return kind === 'film' ? 'Nocturne Draft' : kind === 'text' ? 'Chronicle Draft' : 'Persona Draft';
}

function buildSmartFallbackField(
  fieldKey: string,
  kind: CreationKind,
  userText: string,
  locale: Locale,
): string {
  const snippet = userText.trim().slice(0, 72);
  if (locale === 'zh') {
    const map: Record<string, string> = {
      summary: userText.trim(),
      protagonist: `身处风暴中心的关键人物，围绕「${snippet.slice(0, 24)}」展开行动并背负隐秘动机`,
      conflict: '时间紧迫与道德抉择并存：拯救眼前之人还是揭开更深层的真相',
      setting: '高对比度封闭空间与夜晚氛围场景，适合近景特写与紧张调度',
      tone: '电影感暗调悬疑，冷暖光影交错，节奏紧凑克制',
      coreExperience: '强代入感的第一/第二人称抉择体验，每个选择都会改变人物信任度与走向',
      keyChoice: '在关键转折点选择相信陌生人的线索，还是按规则独自行动并承担后果',
      playerRole: '掌握有限信息与关键资源的亲历者，需要在各方势力之间周旋',
      coreLoop: '探索线索 → 资源与情报抉择 → 触发分支事件 → 改写世界状态',
      mechanics: '双维数值（信任/理智）+ 关键道具解锁隐藏分支 + 多周目伏笔回收',
      identity: `极具反差感的核心角色，背景紧扣「${snippet.slice(0, 20)}」`,
      goal: '在守住内心底线的同时，与玩家共同解开未竟的心结',
      relationship: '亦师亦友 / 逐渐建立深层羁绊的搭档关系',
      boundaries: '保持角色人格一致性，不轻易打破世界观设定，拒绝违背核心底线的请求',
    };
    return map[fieldKey] || snippet;
  }

  const mapEn: Record<string, string> = {
    summary: userText.trim(),
    protagonist: `A sharp, conflicted lead thrust into "${snippet.slice(0, 32)}" with something personal at stake`,
    conflict: 'A ticking-clock dilemma pitting immediate survival against uncovering a hidden truth',
    setting: 'An atmospheric, enclosed nocturnal location built for close-up tension and cinematic framing',
    tone: 'Moody neo-noir cinematography, tactile shadows, restrained pacing with sudden spikes of tension',
    coreExperience: 'High-stakes narrative agency where subtle dialogue choices permanently reshape alliances',
    keyChoice: 'Trust an unreliable ally with a dangerous secret, or act alone and risk irreversible fallout',
    playerRole: 'An investigator-operator navigating scarce resources and competing agendas',
    coreLoop: 'Survey scene → Weigh risk & clues → Commit to a choice → Watch world state shift',
    mechanics: 'Trust & Composure meters, clue synthesis, and branching consequences across chapters',
    identity: `A memorable, layered persona rooted in "${snippet.slice(0, 28)}"`,
    goal: 'Protect what matters most while slowly opening up to someone who earns their trust',
    relationship: 'Wary confidant evolving into a deeply loyal partner',
    boundaries: 'Stays in-character, protects core secrets until trust is earned, never breaks tone',
  };
  return mapEn[fieldKey] || snippet;
}

export async function runCreativeTurn(params: {
  kind: CreationKind;
  brief: CreativeBrief;
  userMessage: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  locale: Locale;
  llmConfig: LLMConfig;
}): Promise<EngineTurnResult> {
  const { kind, brief, userMessage, history, locale, llmConfig } = params;

  if (llmConfig.enabled && llmConfig.apiKey.trim() && llmConfig.baseUrl.trim()) {
    try {
      const requiredKeys = getRequiredFieldKeys(kind);
      const sysPrompt = `You are DramaFork's creative director assistant helping shape a ${kind} brief.
Return ONLY valid JSON with shape:
{
  "reply": "concise warm director reply in ${locale === 'zh' ? 'Simplified Chinese' : 'English'}",
  "title": "optional updated title",
  "updates": { "fieldKey": "extracted value" },
  "suggestedReplies": ["3 concise follow-up reply options for the user"]
}
Allowed field keys for ${kind}: ${requiredKeys.join(', ')}, theme, endingCount, characterCount, durationTarget, audience, keyElements.
Current brief: ${JSON.stringify(brief)}`;

      const res = await fetch(`${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${llmConfig.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: llmConfig.model || 'gpt-4o-mini',
          temperature: 0.7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: sysPrompt },
            ...history.slice(-8),
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          let nextBrief = { ...brief };
          const updatedFields: string[] = [];
          if (parsed.title && typeof parsed.title === 'string') {
            nextBrief.title = parsed.title;
          }
          if (parsed.updates && typeof parsed.updates === 'object') {
            for (const [k, v] of Object.entries(parsed.updates)) {
              if (typeof v === 'string' && v.trim()) {
                nextBrief = setBriefFieldValue(nextBrief, kind, k, v.trim(), false);
                updatedFields.push(k);
              }
            }
          }
          return {
            reply: parsed.reply || 'Updated your creative brief.',
            nextBrief,
            updatedFields,
            suggestedReplies: Array.isArray(parsed.suggestedReplies)
              ? parsed.suggestedReplies.slice(0, 3)
              : [],
          };
        }
      }
    } catch {
      // Fall back gracefully to built-in creative engine
    }
  }

  // Built-in deterministic creative director engine (simulates natural multi-turn shaping)
  await new Promise((r) => setTimeout(r, 650));

  let nextBrief = { ...brief };
  const updatedFields: string[] = [];

  if (!nextBrief.title) {
    nextBrief.title = deriveTitle(userMessage, kind, locale);
  }

  const requiredKeys = getRequiredFieldKeys(kind);
  const missingBefore = requiredKeys.filter((k) => !getBriefFieldValue(nextBrief, kind, k));

  if (missingBefore.length > 0) {
    // First turn fills summary + 2 contextual essentials; subsequent turns fill 2-3 remaining essentials
    const batchSize = history.length === 0 ? 3 : 2;
    const targets = missingBefore.slice(0, batchSize);

    targets.forEach((key, idx) => {
      const val =
        idx === 0
          ? userMessage.trim()
          : buildSmartFallbackField(key, kind, userMessage, locale);
      nextBrief = setBriefFieldValue(
        nextBrief,
        kind,
        key,
        val,
        kind === 'character' && idx > 0,
      );
      updatedFields.push(key);
    });

    // Also enrich one optional production detail on first turn
    if (history.length === 0) {
      if (kind === 'film') {
        nextBrief = setBriefFieldValue(
          nextBrief,
          kind,
          'endingCount',
          locale === 'zh' ? '3 个主结局 + 1 个隐藏真相结局' : '3 main endings + 1 hidden truth ending',
        );
        nextBrief = setBriefFieldValue(
          nextBrief,
          kind,
          'durationTarget',
          locale === 'zh' ? '15–20 分钟' : '15–20 mins',
        );
      } else if (kind === 'text') {
        nextBrief = setBriefFieldValue(
          nextBrief,
          kind,
          'textMode',
          locale === 'zh' ? '章节分支 + 状态追踪' : 'Chapter branching + state tracking',
        );
      } else {
        nextBrief = setBriefFieldValue(
          nextBrief,
          kind,
          'traits',
          locale === 'zh' ? '克制, 敏锐, 暗藏温柔' : 'Composed, Observant, Quietly warm',
          true,
        );
      }
    }
  } else {
    // All required fields confirmed; refine summary or extraRequirements with user's note
    const extraKey = kind === 'film' ? 'extraRequirements' : kind === 'text' ? 'openingNarrative' : 'openingMessage';
    nextBrief = setBriefFieldValue(nextBrief, kind, extraKey, userMessage.trim());
    updatedFields.push(extraKey);
  }

  const progress = getBriefProgress(nextBrief, kind);
  const updatedLabels = updatedFields.map((k) => fieldLabel(locale, kind, k));
  const nextMissing = progress.missingKeys.slice(0, 2);
  const nextMissingLabels = nextMissing.map((k) => fieldLabel(locale, kind, k));

  let reply = '';
  let suggestedReplies: string[] = [];

  if (progress.complete) {
    if (locale === 'zh') {
      reply = `太棒了！我已经把「${updatedLabels.join('、')}」同步写入简报。当前全部 ${progress.total} 项核心设定已就绪，你可以切换到「简报」页微调细节，或直接点击「开始创作」进入 Studio 制片台生成可玩分支！`;
      suggestedReplies = [
        '把整体氛围改得更有悬疑压迫感一点',
        '帮我增加一个出人意料的反转结局',
        '现在已经很满意了，准备进入 Studio 制片台',
      ];
    } else {
      reply = `Locked in! I've updated ${updatedLabels.join(', ')} in your brief. All ${progress.total} essentials are now confirmed—switch to the Brief tab to review or launch straight into the Studio to build and playtest your interactive graph.`;
      suggestedReplies = [
        'Push the atmosphere a bit darker and higher-stakes',
        'Add an unexpected twist ending based on an early choice',
        'Looks solid — ready to open the Studio',
      ];
    }
  } else {
    if (locale === 'zh') {
      reply = `很有画面感的切入点！我已经先帮你把「${updatedLabels.join('、')}」整理进简报（已完成 ${progress.confirmed}/${progress.total}）。\n\n接下来我们补齐「${nextMissingLabels.join('」和「')}」：你希望这一部分呈现出怎样的戏剧张力或体验？`;
      suggestedReplies = [
        `让「${nextMissingLabels[0]}」更有反差感，并设置一个倒计时危机`,
        '我希望节奏偏电影感、对话精炼、每个选项都有明显后果',
        '你直接帮我按最佳方案补全剩下的核心设定吧',
      ];
    } else {
      reply = `Strong hook! I've captured ${updatedLabels.join(', ')} into your brief (${progress.confirmed}/${progress.total} essentials confirmed).\n\nNext, let's nail down ${nextMissingLabels.join(' and ')}: what kind of tension or player feeling do you want there?`;
      suggestedReplies = [
        `Make ${nextMissingLabels[0]} high-contrast with a ticking-clock twist`,
        'Keep the pacing cinematic with punchy dialogue and lasting consequences',
        'Go ahead and fill in the remaining essentials with your best creative pitch',
      ];
    }
  }

  return { reply, nextBrief, updatedFields, suggestedReplies };
}

export function autoCompleteRemainingBrief(
  brief: CreativeBrief,
  kind: CreationKind,
  locale: Locale,
): CreativeBrief {
  let next = { ...brief };
  if (!next.title) {
    next.title = locale === 'zh' ? '午夜分岔口' : 'The Midnight Fork';
  }
  const seed = next.summary || next.title;
  for (const key of getRequiredFieldKeys(kind)) {
    if (!getBriefFieldValue(next, kind, key)) {
      next = setBriefFieldValue(
        next,
        kind,
        key,
        buildSmartFallbackField(key, kind, seed, locale),
        true,
      );
    }
  }
  return next;
}

export function generateInitialStudioNodes(
  brief: CreativeBrief,
  kind: CreationKind,
  locale: Locale,
): StoryNode[] {
  const title = brief.title || (locale === 'zh' ? '未命名作品' : 'Untitled Project');
  const setting =
    getBriefFieldValue(brief, kind, 'setting') ||
    getBriefFieldValue(brief, kind, 'summary') ||
    (locale === 'zh' ? '午夜霓虹交错的封闭空间' : 'A rain-slicked nocturnal interior');
  const choiceHint =
    getBriefFieldValue(brief, kind, 'keyChoice') ||
    getBriefFieldValue(brief, kind, 'coreLoop') ||
    (locale === 'zh' ? '信任对方还是独自调查' : 'Trust the stranger or investigate alone');

  if (locale === 'zh') {
    return [
      {
        id: 'node-open',
        title: '01 · 序幕引入',
        type: 'opening',
        setting,
        visualCue: '缓慢推近镜头 · 冷色环境光与低频环境音',
        narrative: `【${title}】拉开帷幕。${brief.summary || '夜色降临，一条异常信号打破了原本的平静。'} 空气中弥漫着山雨欲来的气息，你必须立刻做出第一项判断。`,
        choices: [
          {
            id: 'c1',
            label: `正面切入：${choiceHint.slice(0, 26)}`,
            targetNodeId: 'node-branch-a',
            consequence: '信任 +1 · 暴露行踪',
          },
          {
            id: 'c2',
            label: '保持距离，先暗中搜集关键证据',
            targetNodeId: 'node-branch-b',
            consequence: '洞察 +1 · 时间流逝',
          },
        ],
      },
      {
        id: 'node-branch-a',
        title: '02A · 正面对峙',
        type: 'branch',
        setting: '狭窄走廊 / 灯光闪烁的交汇处',
        visualCue: '手持跟拍 · 呼吸声放大',
        narrative: '对方似乎早就料到你会现身，递来一枚带有编号的信物，同时警告你真正的幕后之人正在监听一切。',
        choices: [
          {
            id: 'c3',
            label: '接过信物并结成临时同盟',
            targetNodeId: 'node-end-truth',
            consequence: '解锁真相线',
          },
          {
            id: 'c4',
            label: '当场拆穿对方漏洞并强行脱身',
            targetNodeId: 'node-end-solo',
            consequence: '触发孤狼结局',
          },
        ],
      },
      {
        id: 'node-branch-b',
        title: '02B · 暗中窥探',
        type: 'branch',
        setting: '监控室 / 档案暗格',
        visualCue: '俯拍广角 · 屏幕蓝光映在脸上',
        narrative: '你在角落里发现了一份被刻意撕毁的记录，拼合后露出了指向今晚零点的倒计时坐标。',
        choices: [
          {
            id: 'c5',
            label: '带着残页直奔零点坐标',
            targetNodeId: 'node-end-truth',
            consequence: '真相拼图完成',
          },
          {
            id: 'c6',
            label: '匿名公开这份记录，彻底掀翻棋盘',
            targetNodeId: 'node-end-solo',
            consequence: '触发反转结局',
          },
        ],
      },
      {
        id: 'node-end-truth',
        title: '结局 A · 黎明真相',
        type: 'ending',
        setting: '天台 / 晨雾散去的城市天际线',
        visualCue: '暖色逆光 · 弦乐渐起',
        narrative: '所有的线索在黎明前严丝合缝地拼合。你不仅改写了原本注定的结局，还为下一章埋下了新的伏笔。',
        choices: [],
      },
      {
        id: 'node-end-solo',
        title: '结局 B · 孤注一掷',
        type: 'ending',
        setting: '雨停后的空旷街道',
        visualCue: '长镜头拉远 · 留白余韵',
        narrative: '你以最小代价抽身离场，但远处的警笛与未接来电提醒着你：这场博弈才刚刚开始。',
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
      visualCue: 'Slow push-in · Cool ambient backlight, subtle low-frequency hum',
      narrative: `${title} begins. ${brief.summary || 'A sudden anomaly shatters the quiet night.'} The clock is already running, and your first move sets the trajectory.`,
      choices: [
        {
          id: 'c1',
          label: `Step forward: ${choiceHint.slice(0, 34)}`,
          targetNodeId: 'node-branch-a',
          consequence: 'Trust +1 · Cover blown',
        },
        {
          id: 'c2',
          label: 'Stay hidden and gather leverage first',
          targetNodeId: 'node-branch-b',
          consequence: 'Insight +1 · Time lost',
        },
      ],
    },
    {
      id: 'node-branch-a',
      title: '02A · Direct Confrontation',
      type: 'branch',
      setting: 'Dim corridor under flickering fluorescent light',
      visualCue: 'Handheld close-up · Tight framing on eye contact',
      narrative:
        'They expected you. Before you can speak, they slide a numbered token across the table and warn you someone else is listening.',
      choices: [
        {
          id: 'c3',
          label: 'Take the token and form a fragile alliance',
          targetNodeId: 'node-end-truth',
          consequence: 'Unlocks Truth Ending',
        },
        {
          id: 'c4',
          label: 'Call their bluff and walk out immediately',
          targetNodeId: 'node-end-solo',
          consequence: 'Triggers Lone Wolf Ending',
        },
      ],
    },
    {
      id: 'node-branch-b',
      title: '02B · Shadow Investigation',
      type: 'branch',
      setting: 'Back-room terminal bathed in monitor glow',
      visualCue: 'High-angle wide shot · Blue screen reflections',
      narrative:
        'Hidden inside a purged log, you recover a timestamped coordinate pointing to midnight—and a name you recognize.',
      choices: [
        {
          id: 'c5',
          label: 'Race to the midnight coordinate with the proof',
          targetNodeId: 'node-end-truth',
          consequence: 'Truth piece complete',
        },
        {
          id: 'c6',
          label: 'Broadcast the log anonymously and flip the board',
          targetNodeId: 'node-end-solo',
          consequence: 'Triggers Twist Ending',
        },
      ],
    },
    {
      id: 'node-end-truth',
      title: 'Ending A · Dawn Revelation',
      type: 'ending',
      setting: 'Rooftop overlooking the clearing skyline',
      visualCue: 'Warm rim light · Rising score',
      narrative:
        'Every fragment locks into place before sunrise. You rewrote the inevitable outcome—while leaving one final mystery humming in the distance.',
      choices: [],
    },
    {
      id: 'node-end-solo',
      title: 'Ending B · Calculated Escape',
      type: 'ending',
      setting: 'Empty rain-washed avenue at 4 AM',
      visualCue: 'Slow pull-back wide shot · Ambiguous silence',
      narrative:
        'You walk away intact, but a single unanswered message on your screen makes one thing clear: the real game has only begun.',
      choices: [],
    },
  ];
}
