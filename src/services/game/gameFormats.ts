import type { ChallengeType } from '../../types';

/**
 * The server keeps the historical `mixed` value as the single canonical
 * content stream. Users choose a product journey, not an internal question
 * template. This prevents unsupported format CTAs from reaching production.
 */
export type GameFormat = 'mixed';

export interface GameFormatDefinition {
  id: GameFormat;
  title: string;
  shortTitle: string;
  description: string;
  detail: string;
  icon: 'spark';
  tone: 'violet';
  serverFilter: { type?: ChallengeType; subtype?: 'letters' };
}

export const GAME_FORMATS: readonly GameFormatDefinition[] = [
  {
    id: 'mixed',
    title: 'تحدي قدها',
    shortTitle: 'التحدي القياسي',
    description: 'أسئلة موثقة بإجابات ثابتة وحروف واضحة',
    detail: 'يختار الخادم محتوى متنوعًا قابلًا للعب دون تكرار متتالٍ',
    icon: 'spark',
    tone: 'violet',
    serverFilter: {},
  },
] as const;

export function isGameFormat(value: string | null | undefined): value is GameFormat {
  return value === 'mixed';
}

export function parseGameFormat(value: string | null | undefined): GameFormat {
  return isGameFormat(value) ? value : 'mixed';
}

export function formatById(id: GameFormat): GameFormatDefinition {
  return GAME_FORMATS.find((format) => format.id === id) ?? GAME_FORMATS[0];
}
