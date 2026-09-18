/**
 * Non Pay-to-Win cosmetics — titles unlocked by play, not purchases of power.
 */

export interface TitleDef {
  id: string;
  label: string;
  description: string;
  minWins?: number;
  minStreak?: number;
  minMatches?: number;
}

export const TITLES: TitleDef[] = [
  { id: 'newcomer', label: 'لاعب قدها جديد', description: 'أول خطوة في قدها', minMatches: 0 },
  { id: 'challenger', label: 'المُتحدي', description: 'أكمل 5 مباريات', minMatches: 5 },
  { id: 'winner', label: 'صاحب الانتصارات', description: '10 انتصارات', minWins: 10 },
  { id: 'streak3', label: 'شعلة 3 أيام', description: 'سلسلة يومية 3', minStreak: 3 },
  { id: 'streak7', label: 'أسد الأسبوع', description: 'سلسلة يومية 7', minStreak: 7 },
  { id: 'veteran', label: 'محارب قدها', description: '50 مباراة', minMatches: 50 },
  { id: 'champion', label: 'بطل قدها', description: '50 فوزاً', minWins: 50 },
];

export function unlockedTitles(stats: {
  wins: number;
  totalMatches: number;
  streak?: number;
}): TitleDef[] {
  return TITLES.filter((t) => {
    if (t.minWins != null && stats.wins < t.minWins) return false;
    if (t.minMatches != null && stats.totalMatches < t.minMatches) return false;
    if (t.minStreak != null && (stats.streak ?? 0) < t.minStreak) return false;
    return true;
  });
}

export function bestTitle(stats: {
  wins: number;
  totalMatches: number;
  streak?: number;
}): TitleDef {
  const list = unlockedTitles(stats);
  return list[list.length - 1] ?? TITLES[0];
}
