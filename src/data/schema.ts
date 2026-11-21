import { CreationKind, CreativeBrief, Locale } from '../types';

export interface BriefFieldDef {
  key: string;
  required: boolean;
  fullWidth?: boolean;
  isTokens?: boolean;
  source: 'root' | 'details' | 'authoring';
}

export interface BriefGroupDef {
  id: string;
  titleKey: string;
  fields: string[];
}

export interface KindSchema {
  id: CreationKind;
  templateId: string;
  accentColor: string;
  summaryKey: string;
  groups: BriefGroupDef[];
  extras: string[];
  fields: Record<string, BriefFieldDef>;
}

export const KIND_SCHEMAS: Record<CreationKind, KindSchema> = {
  film: {
    id: 'film',
    templateId: 'film-v1',
    accentColor: '#ffad87',
    summaryKey: 'summary',
    groups: [
      {
        id: 'story',
        titleKey: 'groupStory',
        fields: ['protagonist', 'conflict', 'setting', 'tone'],
      },
      {
        id: 'interaction',
        titleKey: 'groupInteraction',
        fields: ['coreExperience', 'keyChoice'],
      },
    ],
    extras: [
      'theme',
      'endingCount',
      'characterCount',
      'durationTarget',
      'audience',
      'contentLimits',
      'keyElements',
      'extraRequirements',
    ],
    fields: {
      summary: { key: 'summary', required: true, source: 'root' },
      protagonist: { key: 'protagonist', required: true, source: 'details' },
      conflict: { key: 'conflict', required: true, source: 'details' },
      setting: { key: 'setting', required: true, source: 'details' },
      tone: { key: 'tone', required: true, source: 'root' },
      coreExperience: { key: 'coreExperience', required: true, source: 'root' },
      keyChoice: { key: 'keyChoice', required: true, source: 'details' },
      theme: { key: 'theme', required: false, source: 'details' },
      endingCount: { key: 'endingCount', required: false, source: 'details' },
      characterCount: { key: 'characterCount', required: false, source: 'details' },
      durationTarget: { key: 'durationTarget', required: false, source: 'details' },
      audience: { key: 'audience', required: false, source: 'root' },
      contentLimits: { key: 'contentLimits', required: false, fullWidth: true, source: 'details' },
      keyElements: { key: 'keyElements', required: false, isTokens: true, source: 'root' },
      extraRequirements: { key: 'extraRequirements', required: false, fullWidth: true, source: 'details' },
    },
  },
  text: {
    id: 'text',
    templateId: 'text-v1',
    accentColor: '#7fd1f2',
    summaryKey: 'summary',
    groups: [
      {
        id: 'world',
        titleKey: 'groupWorld',
        fields: ['playerRole', 'tone'],
      },
      {
        id: 'gameplay',
        titleKey: 'groupGameplay',
        fields: ['coreExperience', 'coreLoop', 'mechanics'],
      },
    ],
    extras: ['audience', 'keyElements', 'textMode', 'openingNarrative', 'language'],
    fields: {
      summary: { key: 'summary', required: true, source: 'root' },
      playerRole: { key: 'playerRole', required: true, source: 'details' },
      tone: { key: 'tone', required: true, source: 'root' },
      coreExperience: { key: 'coreExperience', required: true, source: 'root' },
      coreLoop: { key: 'coreLoop', required: true, source: 'details' },
      mechanics: { key: 'mechanics', required: true, source: 'details' },
      audience: { key: 'audience', required: false, source: 'root' },
      keyElements: { key: 'keyElements', required: false, isTokens: true, source: 'root' },
      textMode: { key: 'textMode', required: false, source: 'authoring' },
      openingNarrative: { key: 'openingNarrative', required: false, fullWidth: true, source: 'authoring' },
      language: { key: 'language', required: false, source: 'authoring' },
    },
  },
  character: {
    id: 'character',
    templateId: 'character-v1',
    accentColor: '#d0adff',
    summaryKey: 'summary',
    groups: [
      {
        id: 'persona',
        titleKey: 'groupPersona',
        fields: ['identity', 'goal', 'tone'],
      },
      {
        id: 'relationship',
        titleKey: 'groupRelationship',
        fields: ['playerRole', 'relationship', 'coreExperience', 'boundaries'],
      },
    ],
    extras: [
      'audience',
      'keyElements',
      'age',
      'category',
      'openingMessage',
      'traits',
      'coreValues',
      'fears',
      'speakingStyle',
    ],
    fields: {
      summary: { key: 'summary', required: true, source: 'root' },
      identity: { key: 'identity', required: true, source: 'details' },
      goal: { key: 'goal', required: true, source: 'details' },
      tone: { key: 'tone', required: true, source: 'root' },
      playerRole: { key: 'playerRole', required: true, source: 'details' },
      relationship: { key: 'relationship', required: true, source: 'details' },
      coreExperience: { key: 'coreExperience', required: true, source: 'root' },
      boundaries: { key: 'boundaries', required: true, source: 'details' },
      audience: { key: 'audience', required: false, source: 'root' },
      keyElements: { key: 'keyElements', required: false, isTokens: true, source: 'root' },
      age: { key: 'age', required: false, source: 'authoring' },
      category: { key: 'category', required: false, source: 'authoring' },
      openingMessage: { key: 'openingMessage', required: false, fullWidth: true, source: 'authoring' },
      traits: { key: 'traits', required: false, isTokens: true, source: 'authoring' },
      coreValues: { key: 'coreValues', required: false, source: 'authoring' },
      fears: { key: 'fears', required: false, source: 'authoring' },
      speakingStyle: { key: 'speakingStyle', required: false, source: 'authoring' },
    },
  },
};

export function createEmptyBrief(): CreativeBrief {
  return {
    title: '',
    summary: '',
    coreExperience: '',
    tone: '',
    audience: '',
    keyElements: [],
    details: {},
    authoring: {},
    suggestedFields: [],
  };
}

export function getBriefFieldValue(brief: CreativeBrief, kind: CreationKind, key: string): string {
  const def = KIND_SCHEMAS[kind].fields[key];
  if (!def) return '';
  if (key === 'keyElements') return brief.keyElements.join(', ');
  if (def.source === 'root') {
    const val = brief[key as keyof CreativeBrief];
    return typeof val === 'string' ? val.trim() : '';
  }
  if (def.source === 'details') {
    return (brief.details[key] || '').trim();
  }
  return (brief.authoring[key] || '').trim();
}

export function setBriefFieldValue(
  brief: CreativeBrief,
  kind: CreationKind,
  key: string,
  value: string,
  markSuggested = false,
): CreativeBrief {
  const def = KIND_SCHEMAS[kind].fields[key];
  if (!def) return brief;
  const next: CreativeBrief = {
    ...brief,
    details: { ...brief.details },
    authoring: { ...brief.authoring },
    keyElements: [...brief.keyElements],
    suggestedFields: markSuggested
      ? Array.from(new Set([...brief.suggestedFields, key]))
      : brief.suggestedFields.filter((f) => f !== key),
  };

  if (key === 'keyElements') {
    next.keyElements = value
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (def.source === 'root') {
    (next as unknown as Record<string, unknown>)[key] = value;
  } else if (def.source === 'details') {
    next.details[key] = value;
  } else {
    next.authoring[key] = value;
  }
  return next;
}

export function getRequiredFieldKeys(kind: CreationKind): string[] {
  const schema = KIND_SCHEMAS[kind];
  return [
    schema.summaryKey,
    ...schema.groups.flatMap((g) => g.fields),
  ].filter((key) => schema.fields[key]?.required);
}

export function getBriefProgress(brief: CreativeBrief, kind: CreationKind) {
  const requiredKeys = getRequiredFieldKeys(kind);
  const confirmedKeys = requiredKeys.filter((k) => Boolean(getBriefFieldValue(brief, kind, k)));
  const missingKeys = requiredKeys.filter((k) => !getBriefFieldValue(brief, kind, k));
  const extraCount = KIND_SCHEMAS[kind].extras.filter((k) =>
    Boolean(getBriefFieldValue(brief, kind, k)),
  ).length;
  return {
    confirmed: confirmedKeys.length,
    total: requiredKeys.length,
    missingKeys,
    extraCount,
    complete: missingKeys.length === 0,
  };
}

export const SAMPLE_IDEAS: Record<CreationKind, Record<Locale, string[]>> = {
  film: {
    en: [
      'A nocturnal subway thriller where a night-shift dispatcher hears tomorrow’s emergency call and must decide which passenger to warn.',
      'A rainy coastal hotel mystery: three strangers check in with the same room key, and every conversation rewrites who you suspect.',
      'A near-future memory auction where a grieving archivist can trade one real memory to keep a loved one’s simulation alive.',
    ],
    zh: [
      '一部深夜地铁悬疑影游：夜班调度员在广播里听到了明天的求救电话，必须在有限时间里决定先警告哪位乘客。',
      '雨夜海边旅馆的群像推理：三名陌生人拿着同一把房门钥匙入住，你的每一次对话都会改写嫌疑人名单。',
      '近未来记忆拍卖会：一名档案修复师必须交出自己最珍贵的真实记忆，才能维持挚爱数字意识的运转。',
    ],
  },
  text: {
    en: [
      'A clockwork observatory survival game where you manage lantern oil, decode star charts, and negotiate with rival astronomers.',
      'An imperial court intrigue sim where every banquet rumor can be amplified, buried, or traded for political leverage.',
      'A deep-sea salvage roguelike: choose which flooded hull compartments to breach before oxygen runs out.',
    ],
    zh: [
      '一座发条天文台求生文字游戏：你需要分配煤油与体力、破译星图，并在资源匮乏时与其他观测员博弈。',
      '架空朝堂权谋文游：每次宴会传闻都可以选择扩散、掩埋或用来交换势力筹码，推动多线结局。',
      '深海打捞轻肉鸽文字游戏：在氧气耗尽前决定破开哪一间进水船舱，在风险与线索间做抉择。',
    ],
  },
  character: {
    en: [
      'A witty late-night ramen stall owner who remembers every customer’s unspoken regret and offers cryptic culinary advice.',
      'An exiled royal cartographer hiding in a floating library, sharp-tongued yet fiercely loyal once you earn her trust.',
      'A retired detective turned antique watchmaker who treats every broken timepiece like a cold case waiting to be solved.',
    ],
    zh: [
      '一位深夜拉面摊主，总能一眼看穿食客没说出口的遗憾，用看似随口的料理比喻点醒迷茫的人。',
      '隐居在浮空图书馆的流亡宫廷制图师，嘴硬毒舌，但一旦认可你是同伴就会拼尽全力护短。',
      '退休侦探转行的古董修表师，把每一块停摆的怀表都当成一桩悬案来推理。',
    ],
  },
};
