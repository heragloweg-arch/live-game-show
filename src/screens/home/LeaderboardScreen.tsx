import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Trophy, Loader2, RefreshCw } from 'lucide-react';
import { fetchLeaderboard } from '../../services/profile/profileApi';
import type { UserProfile } from '../../types';
import { cn } from '../../utils/cn';

export function LeaderboardScreen() {
  const [entries, setEntries] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeaderboard(30);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="min-h-screen px-5 pb-10 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 font-display text-2xl font-bold">المتصدرين</h1>
        <button onClick={load} className="btn-ghost p-2" aria-label="تحديث">
          <RefreshCw className={cn('h-5 w-5', loading && 'animate-spin')} />
        </button>
      </header>

      <p className="mb-4 text-xs text-white/40">الترتيب حسب الفوز ثم الخبرة · بيانات حقيقية</p>

      {loading && entries.length === 0 && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-zatona-400" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="card px-6 py-12 text-center text-sm text-white/45">
          لا يوجد لاعبون بعد. كن أول من يفوز في قدها!
        </div>
      )}

      <div className="space-y-2">
        {entries.map((e, idx) => {
          const rank = idx + 1;
          return (
            <div key={e.id} className="card flex items-center gap-4 px-4 py-3">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full font-bold',
                  rank === 1 && 'bg-gold-500 text-surface-900',
                  rank === 2 && 'bg-white/20 text-white',
                  rank === 3 && 'bg-amber-700/60 text-amber-200',
                  rank > 3 && 'bg-white/5 text-white/60'
                )}
              >
                {rank === 1 ? <Trophy className="h-4 w-4" /> : rank}
              </div>
              <div className="flex-1">
                <p className="font-medium">{e.displayName}</p>
                <p className="text-xs text-white/40">
                  @{e.username} · المستوى {e.level}
                </p>
              </div>
              <div className="text-left">
                <p className="font-display font-bold text-zatona-400">{e.wins} فوز</p>
                <p className="text-[10px] text-white/30">{e.xp} XP</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
