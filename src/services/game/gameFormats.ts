import type { ChallengeType } from '../../types';

export type GameFormat = 'mixed' | 'speed' | 'letters' | 'knowledge' | 'words';

export interface GameFormatDefinition {
  id: GameFormat;
  title: string;
  shortTitle: string;
  description: string;
  detail: string;
  icon: 'spark' | 'bolt' | 'letters' | 'brain' | 'quote';
  tone: 'violet' | 'gold' | 'cyan' | 'pink' | 'mint';
  serverFilter: { type?: ChallengeType; subtype?: 'letters' };
}

export const GAME_FORMATS: readonly GameFormatDefinition[] = [
  {
    id: 'mixed',
    title: 'مزيج قدها',
    shortTitle: 'مزيج',
    description: 'تنقل ذكي بين السرعة والمعرفة والكلمات',
    detail: 'التجربة الأشمل — كل جولة مفاجأة جديدة',
    icon: 'spark',
    tone: 'violet',
    serverFilter: {},
  },
  {
    id: 'speed',
    title: 'نبض السرعة',
    shortTitle: 'سرعة',
    description: 'أجب قبل أن يسبقك الوقت',
    detail: 'جولات خاطفة بإيقاع سريع',
    icon: 'bolt',
    tone: 'gold',
    serverFilter: { type: 'speed' },
  },
  {
    id: 'letters',
    title: 'حروف مبعثرة',
    shortTitle: 'حروف',
    description: 'رتّب الحروف وابنِ الإجابة',
    detail: 'تحدي لغوي واضح مع تلميح الطول',
    icon: 'letters',
    tone: 'cyan',
    serverFilter: { subtype: 'letters' },
  },
  {
    id: 'knowledge',
    title: 'ساحة المعرفة',
    shortTitle: 'معرفة',
    description: 'اختبر معلوماتك في مجالات متنوعة',
    detail: 'أسئلة موثقة من بنك قدها المعتمد',
    icon: 'brain',
    tone: 'pink',
    serverFilter: { type: 'knowledge' },
  },
  {
    id: 'words',
    title: 'أهل الكلمات',
    shortTitle: 'كلمات',
    description: 'أكمل العبارة واربط المعنى',
    detail: 'أمثال وحِكم وكلمات مترابطة',
    icon: 'quote',
    tone: 'mint',
    serverFilter: { type: 'words' },
  },
] as const;

export function isGameFormat(value: string | null | undefined): value is GameFormat {
  return GAME_FORMATS.some((format) => format.id === value);
}

export function parseGameFormat(value: string | null | undefined): GameFormat {
  return isGameFormat(value) ? value : 'mixed';
}

export function formatById(id: GameFormat): GameFormatDefinition {
  return GAME_FORMATS.find((format) => format.id === id) ?? GAME_FORMATS[0];
}
