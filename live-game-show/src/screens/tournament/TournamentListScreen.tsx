import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Trophy, Users, Coins, Loader2 } from 'lucide-react';
import { listTournaments, type Tournament } from '../../services/api/tournamentApi';
import { cn } from '../../utils/cn';
import { ScreenShell } from '../../components/layout/ScreenShell';

export function TournamentListScreen() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTournaments()
      .then((r) => setItems(r.tournaments))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-black text-gradient-gold">دوري الأبطال</h1>
          <p className="text-xs text-white/45">تنافس على اللقب والجوائز</p>
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {items.map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => navigate(`/tournament/${t.id}`)}
            className="card w-full p-5 text-right transition active:scale-[0.99]"
          >
            <div className="mb-2 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-gold-400" />
              <h2 className="flex-1 font-display text-lg font-bold">{t.title}</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  t.status === 'registration' && 'bg-zatona-500/20 text-zatona-400',
                  t.status === 'active' && 'bg-orange-500/20 text-orange-400',
                  t.status === 'completed' && 'bg-white/10 text-white/50'
                )}
              >
                {t.status === 'registration' ? 'تسجيل' : t.status === 'active' ? 'جاري' : t.status}
              </span>
            </div>
            <p className="mb-3 text-xs text-white/45 line-clamp-2">{t.description}</p>
            <div className="flex gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {t.entriesCount ?? 0}/{t.max_players}
              </span>
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-gold-400" />
                دخول {t.entry_coins}
              </span>
              <span className="text-gold-400">جائزة {t.prize_pool}</span>
            </div>
          </motion.button>
        ))}
        {!loading && items.length === 0 && !error && (
          <p className="py-12 text-center text-sm text-white/40">لا توجد بطولات مفتوحة حالياً</p>
        )}
      </div>
    </ScreenShell>
  );
}
