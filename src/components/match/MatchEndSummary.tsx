import { Link } from 'react-router-dom';
import { ArrowLeft, Coins, Flame, Share2, Sparkles, Trophy } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface MatchEndSummaryProps {
  matchId: string;
  mode?: string;
  won: boolean;
  draw: boolean;
  playerScore: number;
  opponentScore: number;
  coinGain: number | null;
  xpGain: number | null;
  streak?: number;
  onShare: () => void;
  onRematch: () => void;
  onReset: () => void;
}

export function MatchEndSummary({ mode, won, draw, playerScore, opponentScore, coinGain, xpGain, streak = 0, onShare, onRematch, onReset }: MatchEndSummaryProps) {
  const title = won ? 'فوز مستحق!' : draw ? 'تعادل قوي' : 'جولة ونتعلم منها';
  const tone = won ? 'text-amber-200' : draw ? 'text-cyan-200' : 'text-white/80';
  return <div className="w-full max-w-md space-y-3">
    <section className="card-glow p-7 text-center">
      <div className="relative z-10"><div className={cn('mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-400/15', won ? 'text-amber-200' : 'text-violet-200')}><Trophy className="h-8 w-8" /></div><p className="eyebrow">{mode === 'team' ? 'نتيجة الفريق' : 'النتيجة النهائية'}</p><h2 className={cn('mt-2 font-display text-3xl font-black', tone)}>{title}</h2><div className="mt-5 flex items-center justify-center gap-4"><strong className="font-display text-4xl font-black text-white">{playerScore}</strong><span className="text-white/25">—</span><strong className="font-display text-4xl font-black text-white/55">{opponentScore}</strong></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-amber-400/10 p-3"><Coins className="mx-auto h-4 w-4 text-amber-300" /><p className="mt-1 text-sm font-black text-amber-100">{coinGain == null ? 'جارٍ التحديث' : `+${coinGain}`}</p><span className="text-[10px] text-white/40">عملة</span></div><div className="rounded-2xl bg-violet-400/10 p-3"><Sparkles className="mx-auto h-4 w-4 text-violet-300" /><p className="mt-1 text-sm font-black text-violet-100">{xpGain == null ? 'جارٍ التحديث' : `+${xpGain}`}</p><span className="text-[10px] text-white/40">XP</span></div></div>{streak > 0 && <div className="mt-4 flex items-center justify-center gap-2 text-xs text-orange-200"><Flame className="h-4 w-4" />سلسلتك اليومية {streak} يوم</div>}</div>
    </section>
    <button type="button" onClick={onShare} className="btn-secondary w-full"><Share2 className="h-4 w-4" />شارك نتيجتك</button>
    <div className="grid grid-cols-2 gap-3"><button type="button" onClick={onRematch} className="btn-primary w-full">مباراة جديدة</button><Link to="/daily" onClick={onReset} className="btn-secondary w-full text-center">حزمة اليوم</Link></div>
    <Link to="/home" onClick={onReset} className="btn-ghost w-full"><ArrowLeft className="h-4 w-4" />الرئيسية</Link>
  </div>;
}
