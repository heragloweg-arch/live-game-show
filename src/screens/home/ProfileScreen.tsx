import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogOut, Coins, Pencil, Loader2, History, Swords, Sun, Moon, Monitor } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { updateProfile, fetchMatchHistory, fetchRecentOpponents, type RecentOpponent, type MatchHistoryRecord } from '../../services/profile/profileApi';
import { createRematch } from '../../services/api/matchApi';
import { cn } from '../../utils/cn';
import { bestTitle } from '../../services/cosmetics/titles';
import { BottomAdBanner } from '../../components/ads/BottomAdBanner';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';

export function ProfileScreen() {
  const navigate = useNavigate();
  const { user, signOut, refreshProfile } = useAuthStore();
  const { wallet, loadWallet } = useWalletStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<MatchHistoryRecord[]>([]);
  const [opponents, setOpponents] = useState<RecentOpponent[]>([]);
  const [rematching, setRematching] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void loadWallet();
    void refreshProfile();
  }, [loadWallet, refreshProfile]);

  useEffect(() => {
    setName(user?.displayName ?? '');
  }, [user?.displayName]);

  useEffect(() => {
    if (!user?.id) return;
    fetchMatchHistory(user.id).then(setHistory);
    fetchRecentOpponents(user.id).then(setOpponents);
  }, [user?.id]);

  const rematch = async (opponent: RecentOpponent) => {
    setRematching(opponent.userId);
    try {
      const match = await createRematch(opponent.lastMatchId);
      navigate(`/match/${match.matchId ?? match.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تعذر بدء الإعادة');
    } finally { setRematching(null); }
  };

  const save = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await updateProfile(user.id, { displayName: name.trim() });
      await refreshProfile();
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen px-5 pb-10 pt-6">
      <header className="mb-8 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-2xl font-bold">الملف الشخصي</h1>
      </header>

      <div className="card mb-5 flex flex-col items-center gap-4 p-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-zatona-500 bg-zatona-500/10 text-3xl font-bold text-zatona-400">
          {(user?.displayName ?? 'ز')[0]}
        </div>

        {editing ? (
          <div className="flex w-full flex-col gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-center"
              dir="rtl"
              maxLength={32}
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
                {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'حفظ'}
              </button>
              <button onClick={() => setEditing(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                إلغاء
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">
                {user?.displayName ?? 'لاعب قدها'}
              </h2>
              <button onClick={() => setEditing(true)} className="btn-ghost p-1">
                <Pencil className="h-4 w-4 text-white/40" />
              </button>
            </div>
            <p className="text-sm text-white/50">@{user?.username ?? 'player'}</p>
            <p className="mt-1 text-xs font-semibold text-gold-400/90">
              {bestTitle({
                wins: user?.wins ?? 0,
                totalMatches: user?.totalMatches ?? 0,
              }).label}
            </p>
          </div>
        )}

        {err && <p className="text-xs text-red-400">{err}</p>}

        <div className="flex gap-6 text-center">
          <Stat label="فوز" value={user?.wins ?? 0} />
          <Stat label="خسارة" value={user?.losses ?? 0} />
          <Stat label="مباريات" value={user?.totalMatches ?? 0} />
        </div>

        <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500/10 px-4 py-2.5 text-gold-400">
          <Coins className="h-4 w-4" />
          <span className="font-display font-bold">
            {wallet?.coins ?? user?.coins ?? 0}
          </span>
          <span className="text-xs text-gold-400/70">عملة</span>
        </div>

        <div className="w-full">
          <div className="mb-1 flex justify-between text-xs text-white/40">
            <span>المستوى {user?.level ?? 1}</span>
            <span>
              {user?.xp ?? 0} / {user?.xpToNextLevel ?? 100} XP
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-l from-zatona-500 to-zatona-400"
              style={{
                width: `${Math.min(100, ((user?.xp ?? 0) / (user?.xpToNextLevel ?? 100)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="card mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-zatona-400" />
          آخر المباريات
        </div>
        {history.length === 0 ? (
          <p className="py-4 text-center text-xs text-white/35">لا يوجد سجل بعد</p>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 8).map((h) => {
              const m = h.matches;
              const won = m?.winner_id === user?.id;
              return (
                <div
                  key={h.match_id}
                  className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      won ? 'bg-zatona-500/20 text-zatona-400' : 'bg-white/10 text-white/50'
                    )}
                  >
                    {m?.mode ?? 'match'}
                  </span>
                  <span className="flex-1 text-white/70">{h.score} نقطة</span>
                  <span className="text-xs text-white/35">
                    {m?.ended_at ? new Date(m.ended_at).toLocaleDateString('ar') : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {opponents.length > 0 && <div className="card mb-5 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><Swords className="h-4 w-4 text-gold-400" />آخر المنافسين</div><div className="space-y-2">{opponents.map((opponent) => <div key={opponent.userId} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-400/15 font-bold text-violet-200">{opponent.displayName[0]}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{opponent.displayName}</p><p className="truncate text-[11px] text-white/35">@{opponent.username}</p></div><button type="button" onClick={() => void rematch(opponent)} disabled={rematching === opponent.userId} className="btn-secondary px-3 py-2 text-xs">{rematching === opponent.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'إعادة'}</button></div>)}</div></div>}

      <ThemePicker mode={themeMode} onChange={setThemeMode} />

      <BottomAdBanner />
      <button
        onClick={() => signOut()}
        className="btn-secondary w-full gap-2 border-red-500/30 text-red-400"
      >
        <LogOut className="h-5 w-5" />
        تسجيل الخروج
      </button>
    </div>
  );
}

function ThemePicker({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'حسب الجهاز', icon: Monitor },
    { value: 'dark', label: 'Qaddaha Night', icon: Moon },
    { value: 'light', label: 'Qaddaha Day', icon: Sun },
  ];
  return <section className="card mb-5 p-4" aria-labelledby="theme-heading">
    <div className="mb-3"><h2 id="theme-heading" className="text-sm font-bold">مظهر التطبيق</h2><p className="mt-1 text-xs text-white/45">اختر المظهر الأكثر راحة لك أثناء اللعب</p></div>
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="مظهر التطبيق">
      {options.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => onChange(value)} className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold transition', mode === value ? 'border-violet-400/60 bg-violet-500/15 text-violet-200' : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10')}><Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span></button>)}
    </div>
  </section>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-zatona-400">{value}</p>
      <p className="text-xs text-white/45">{label}</p>
    </div>
  );
}
