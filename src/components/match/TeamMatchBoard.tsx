import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

export type TeamParticipant = {
  userId?: string;
  username?: string;
  score?: number;
  side?: string;
  answered?: boolean;
};

export function TeamMatchBoard({
  scoreA,
  scoreB,
  membersA,
  membersB,
  teamSize,
}: {
  scoreA: number;
  scoreB: number;
  membersA: TeamParticipant[];
  membersB: TeamParticipant[];
  teamSize?: number;
}) {
  return (
    <div className="w-full space-y-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300">فريق A</p>
          <p className="font-display text-3xl font-black text-sky-200">{scoreA}</p>
        </div>
        <div className="font-display text-lg font-black text-white/40">
          {teamSize ? `${teamSize}v${teamSize}` : 'VS'}
        </div>
        <div className="flex-1 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300">فريق B</p>
          <p className="font-display text-3xl font-black text-rose-200">{scoreB}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MemberCol title="A" members={membersA} tone="sky" />
        <MemberCol title="B" members={membersB} tone="rose" />
      </div>
    </div>
  );
}

function MemberCol({
  title,
  members,
  tone,
}: {
  title: string;
  members: TeamParticipant[];
  tone: 'sky' | 'rose';
}) {
  return (
    <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl bg-black/20 p-2">
      <p className="mb-1 text-[10px] text-white/40">
        أعضاء {title} ({members.length})
      </p>
      {members.length === 0 && <p className="text-[10px] text-white/30">—</p>}
      {members.map((m, i) => (
        <motion.div
          key={m.userId || i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            'flex items-center justify-between rounded-lg px-2 py-1 text-[11px]',
            tone === 'sky' ? 'bg-sky-500/10' : 'bg-rose-500/10'
          )}
        >
          <span className="truncate text-white/80">{m.username || 'لاعب'}</span>
          <span className="font-bold text-white/90">{m.score ?? 0}</span>
        </motion.div>
      ))}
    </div>
  );
}
