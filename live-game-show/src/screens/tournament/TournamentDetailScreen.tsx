import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Trophy, Loader2, UserPlus, LogOut } from 'lucide-react';
import {
  getTournament,
  joinTournament,
  leaveTournament,
  getMyEntry,
  generateBracket,
} from '../../services/api/tournamentApi';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { cn } from '../../utils/cn';
import { track } from '../../services/analytics/events';

export function TournamentDetailScreen() {
  const { tournamentId } = useParams();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const loadWallet = useWalletStore((s) => s.loadWallet);
  const [data, setData] = useState<any>(null);
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const [t, me] = await Promise.all([
        getTournament(tournamentId),
        getMyEntry(tournamentId),
      ]);
      setData(t);
      setEntry(me.entry);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    if (!tournamentId) return;
    setBusy(true);
    setError(null);
    try {
      await joinTournament(tournamentId);
      track('match_start', { mode: 'tournament', tournamentId });
      await load();
      await refreshProfile();
      await loadWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!tournamentId) return;
    setBusy(true);
    try {
      await leaveTournament(tournamentId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gold-400" />
      </div>
    );
  }

  const t = data?.tournament;
  const standings = data?.entries ?? [];

  return (
    <div className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/tournament" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">{t?.title ?? 'دوري'}</h1>
      </header>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="card mb-5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-gold-400" />
          <span className="text-sm text-white/50">{t?.status}</span>
        </div>
        <p className="mb-4 text-sm text-white/60">{t?.description}</p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/5 py-2">
            <p className="text-white/40">دخول</p>
            <p className="font-bold text-gold-400">{t?.entry_coins}</p>
          </div>
          <div className="rounded-xl bg-white/5 py-2">
            <p className="text-white/40">الجائزة</p>
            <p className="font-bold text-gold-400">{t?.prize_pool}</p>
          </div>
          <div className="rounded-xl bg-white/5 py-2">
            <p className="text-white/40">اللاعبون</p>
            <p className="font-bold">{standings.length}/{t?.max_players}</p>
          </div>
        </div>

        <div className="mt-4">
          {!entry ? (
            <button onClick={join} disabled={busy} className="btn-primary w-full gap-2 py-3.5">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              انضم للدوري
            </button>
          ) : t?.status === 'registration' ? (
            <button onClick={leave} disabled={busy} className="btn-secondary w-full gap-2 py-3.5">
              <LogOut className="h-5 w-5" />
              انسحاب (قبل البدء)
            </button>
          ) : (
            <p className="text-center text-sm text-zatona-400">أنت مسجّل — حظاً موفقاً 🏆</p>
          )}
        </div>
      </div>

      
      <h2 className="mb-3 mt-6 font-display text-lg font-bold">شبكة المواجهات</h2>
      <div className="mb-6 space-y-2">
        {(data?.matches ?? []).length === 0 && (
          <p className="py-6 text-center text-sm text-white/35">
            تُولَّد المواجهات تلقائياً عند اكتمال التسجيل
          </p>
        )}
        {(data?.matches ?? []).map((m: any) => (
          <div key={m.id} className="card flex items-center gap-2 px-3 py-2.5 text-xs">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/50">R{m.round_number}</span>
            <span className="flex-1 text-white/80">
              {m.player_a?.slice?.(0, 8) || m.player_a || 'BYE'} vs {m.player_b?.slice?.(0, 8) || m.player_b || 'BYE'}
            </span>
            <span className={m.status === 'completed' ? 'text-zatona-400' : 'text-white/35'}>
              {m.status}
            </span>
          </div>
        ))}
        {t?.status === 'registration' && (data?.entries?.length ?? 0) >= 2 && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!tournamentId) return;
              setBusy(true);
              try {
                await generateBracket(tournamentId, true);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
            className="btn-secondary w-full py-2.5 text-sm"
          >
            توليد الشبكة الآن
          </button>
        )}
      </div>

      <h2 className="mb-3 font-display text-lg font-bold">الترتيب</h2>
      <div className="space-y-2">
        {standings.map((e: any, i: number) => (
          <div key={e.id} className="card flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                i === 0 && 'bg-gold-500 text-surface-900',
                i === 1 && 'bg-white/20',
                i === 2 && 'bg-amber-800/50',
                i > 2 && 'bg-white/5 text-white/50'
              )}
            >
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="font-medium">
                {e.profile?.display_name ?? e.profile?.username ?? 'لاعب'}
              </p>
              <p className="text-[11px] text-white/40">
                {e.wins} فوز · {e.losses} خسارة
              </p>
            </div>
            <p className="font-display font-bold text-zatona-400">{e.points} نقطة</p>
          </div>
        ))}
        {standings.length === 0 && (
          <p className="py-8 text-center text-sm text-white/35">كن أول المنضمين</p>
        )}
      </div>
    </div>
  );
}
