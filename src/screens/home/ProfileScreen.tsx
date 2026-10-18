import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogOut, Coins, Pencil, Loader2, History, Swords, Sun, Moon, Monitor, Flag, Ban, Link2, Unlink, Crown, WalletCards } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { updateProfile, fetchMatchHistory, fetchRecentOpponents, type RecentOpponent, type MatchHistoryRecord } from '../../services/profile/profileApi';
import { createRematch } from '../../services/api/matchApi';
import { cn } from '../../utils/cn';
import { bestTitle } from '../../services/cosmetics/titles';
import { BottomAdBanner } from '../../components/ads/BottomAdBanner';
import { useThemeStore, type ThemeMode } from '../../store/themeStore';
import { blockUser, reportUser } from '../../services/api/safetyApi';
import { fetchLedger } from '../../services/economy/walletApi';
import type { LedgerEntry } from '../../types/economy';
import { fetchSubscriptionStatus } from '../../services/billing/subscriptionApi';
import { fetchHostStatus, type HostStatus } from '../../services/livekit/voiceApi';
import { disconnectTikTok, getTikTokStatus, startTikTokLink, type TikTokStatus } from '../../services/api/tiktokApi';

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
  const [safetyBusy, setSafetyBusy] = useState<string | null>(null);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('free');
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null);
  const [tiktok, setTikTok] = useState<TikTokStatus>({ connected: false, connection: null });
  const [tiktokBusy, setTikTokBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadWallet();
    void refreshProfile();
    void fetchLedger(8).then(setLedger);
    void fetchSubscriptionStatus().then((status) => setSubscriptionPlan(status.plan)).catch(() => undefined);
    void fetchHostStatus().then(setHostStatus).catch(() => undefined);
    void getTikTokStatus().then(setTikTok).catch(() => undefined);
  }, [loadWallet, refreshProfile]);

  useEffect(() => {
    const onTikTokMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'qaddaha:tiktok') return;
      setTikTokBusy(false);
      if (event.data.ok) {
        setAccountMessage('تم ربط حساب TikTok بنجاح.');
        void getTikTokStatus().then(setTikTok);
      } else {
        setAccountMessage(event.data.error ?? 'لم يكتمل ربط TikTok.');
      }
    };
    window.addEventListener('message', onTikTokMessage);
    return () => window.removeEventListener('message', onTikTokMessage);
  }, []);

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

  const reportOpponent = async (opponent: RecentOpponent) => {
    const details = window.prompt(`سبب الإبلاغ عن ${opponent.displayName} (اختياري):`, '');
    if (details === null) return;
    setSafetyBusy(opponent.userId); setSafetyMessage(null);
    try {
      await reportUser(opponent.userId, 'other', details.trim());
      setSafetyMessage('تم إرسال البلاغ للمراجعة. شكرًا لمساعدتنا في الحفاظ على مجتمع آمن.');
    } catch (e) { setSafetyMessage(e instanceof Error ? e.message : 'تعذر إرسال البلاغ.'); }
    finally { setSafetyBusy(null); }
  };

  const blockOpponent = async (opponent: RecentOpponent) => {
    if (!window.confirm(`هل تريد حظر ${opponent.displayName}؟ سيمنع الحظر التفاعلات اللاحقة، وستتم محاولة إخراجه من غرف الصوت المشتركة الحالية.`)) return;
    setSafetyBusy(opponent.userId); setSafetyMessage(null);
    try {
      const result = await blockUser(opponent.userId);
      const kick = result.liveKitKick;
      const voiceMessage = !kick || kick.status === 'not_configured'
        ? ' لم يتأكد إخراجه من الصوت لأن إعداد LiveKit غير مكتمل.'
        : kick.status === 'partial'
          ? ` تمت محاولة إخراجه من ${kick.attempted} غرفة، ونجحت الإزالة من ${kick.removed}؛ يلزم التحقق من الغرف المتبقية.`
          : kick.status === 'complete'
            ? ` تمت إزالة مشاركته من ${kick.removed} غرفة صوت مشتركة.`
            : ' لا توجد غرفة مشتركة نشطة تحتاج إلى الإزالة.';
      setSafetyMessage(`تم حظر ${opponent.displayName}.${voiceMessage}`);
    } catch (e) { setSafetyMessage(e instanceof Error ? e.message : 'تعذر حظر المستخدم.'); }
    finally { setSafetyBusy(null); }
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

  const connectTikTok = async () => {
    setTikTokBusy(true); setAccountMessage(null);
    try {
      const authorizationUrl = await startTikTokLink();
      const popup = window.open(authorizationUrl, 'qaddaha-tiktok-link', 'popup,width=520,height=720');
      if (!popup) throw new Error('اسمح بالنوافذ المنبثقة لإكمال ربط TikTok.');
    } catch (e) {
      setTikTokBusy(false);
      setAccountMessage(e instanceof Error ? e.message : 'تعذر بدء ربط TikTok.');
    }
  };

  const unlinkTikTok = async () => {
    if (!window.confirm('فصل حساب TikTok عن قدها؟')) return;
    setTikTokBusy(true); setAccountMessage(null);
    try {
      await disconnectTikTok();
      setTikTok({ connected: false, connection: null });
      setAccountMessage('تم فصل حساب TikTok.');
    } catch (e) { setAccountMessage(e instanceof Error ? e.message : 'تعذر فصل TikTok.'); }
    finally { setTikTokBusy(false); }
  };

  return (
    <div className="min-h-screen px-5 pb-10 pt-6">
      <header className="mb-8 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-2xl font-bold">لوحة حسابي</h1>
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

      <section className="card mb-5 space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><p className="eyebrow">بيانات الحساب</p><h2 className="mt-1 text-sm font-bold">الدخول والإمكانيات</h2></div>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] text-emerald-200">حساب محمي</span>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-3"><span className="block text-white/35">البريد</span><strong className="mt-1 block truncate text-white/80">{user?.email ?? 'غير متاح'}</strong></div>
          <div className="rounded-xl bg-white/5 p-3"><span className="block text-white/35">طريقة التسجيل</span><strong className="mt-1 block text-white/80">{user?.authProvider === 'google' ? 'Google' : user?.authProvider === 'anonymous' ? 'جلسة مؤقتة' : 'البريد الإلكتروني'}</strong></div>
          <div className="rounded-xl bg-white/5 p-3"><span className="block text-white/35">الخطة</span><strong className="mt-1 block text-amber-100">{subscriptionPlan === 'host_pro' ? 'مضيف برو' : subscriptionPlan === 'plus_monthly' ? 'قدها بلس شهري' : subscriptionPlan === 'plus_yearly' ? 'قدها بلس سنوي' : 'مجاني'}</strong></div>
          <div className="rounded-xl bg-white/5 p-3"><span className="block text-white/35">تجربة المضيف</span><strong className="mt-1 block text-white/80">{hostStatus?.trialAvailable ? 'متاحة · 30 دقيقة' : 'استُخدمت'}</strong></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/host" className="btn-secondary flex-1 gap-2 text-xs"><Crown className="h-4 w-4" />لوحة المضيف</Link>
          <Link to="/subscription" className="btn-secondary flex-1 gap-2 text-xs"><Crown className="h-4 w-4" />الترقية</Link>
          <Link to="/shop" className="btn-secondary flex-1 gap-2 text-xs"><WalletCards className="h-4 w-4" />شراء كوين</Link>
        </div>
      </section>

      <section className="card mb-5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-200"><Link2 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow">Social connection</p><h2 className="font-bold">ربط TikTok</h2><p className="mt-1 text-xs text-white/45">ربط رسمي عبر Login Kit. نستخدم بيانات الحساب اللازمة فقط، ولا نتحكم في TikTok LIVE من دون صلاحية رسمية.</p></div>
          {tiktok.connected ? <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">مربوط</span> : <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/45">غير مربوط</span>}
        </div>
        {tiktok.connection && <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/65">{tiktok.connection.display_name ?? 'حساب TikTok'} · جاهز للغرف المرتبطة</p>}
        {accountMessage && <p role="status" className="mt-3 text-xs text-amber-100/80">{accountMessage}</p>}
        <button type="button" onClick={() => void (tiktok.connected ? unlinkTikTok() : connectTikTok())} disabled={tiktokBusy} className={cn('mt-3 w-full gap-2 text-xs', tiktok.connected ? 'btn-secondary' : 'btn-primary')}>
          {tiktokBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : tiktok.connected ? <Unlink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {tiktokBusy ? 'جارٍ التنفيذ...' : tiktok.connected ? 'فصل TikTok' : 'ربط TikTok'}
        </button>
      </section>

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

      <section className="card mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><WalletCards className="h-4 w-4 text-amber-300" />سجل الكوين</div>
        {ledger.length === 0 ? <p className="py-3 text-center text-xs text-white/35">لا توجد عمليات بعد</p> : <div className="space-y-2">{ledger.map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-xs"><span className={cn('font-bold', entry.amount >= 0 ? 'text-emerald-200' : 'text-red-200')}>{entry.amount >= 0 ? '+' : ''}{entry.amount}</span><span className="flex-1 truncate text-white/60">{ledgerLabel(entry.type)}</span><span className="text-white/30">{new Date(entry.createdAt).toLocaleDateString('ar')}</span></div>)}</div>}
      </section>

      {opponents.length > 0 && <div className="card mb-5 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><Swords className="h-4 w-4 text-gold-400" />آخر المنافسين</div><div className="space-y-2">{opponents.map((opponent) => <div key={opponent.userId} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-400/15 font-bold text-violet-200">{opponent.displayName[0]}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{opponent.displayName}</p><p className="truncate text-[11px] text-white/35">@{opponent.username}</p></div><button type="button" onClick={() => void rematch(opponent)} disabled={rematching === opponent.userId || safetyBusy === opponent.userId} className="btn-secondary px-3 py-2 text-xs">{rematching === opponent.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'إعادة'}</button><button type="button" aria-label={`الإبلاغ عن ${opponent.displayName}`} onClick={() => void reportOpponent(opponent)} disabled={safetyBusy === opponent.userId} className="btn-ghost px-2 py-2 text-xs text-amber-300"><Flag className="h-4 w-4" /><span className="sr-only">إبلاغ</span></button><button type="button" aria-label={`حظر ${opponent.displayName}`} onClick={() => void blockOpponent(opponent)} disabled={safetyBusy === opponent.userId} className="btn-ghost px-2 py-2 text-xs text-red-300"><Ban className="h-4 w-4" /><span className="sr-only">حظر</span></button></div>)}</div>{safetyMessage && <p role="status" className="mt-3 text-xs text-white/65">{safetyMessage}</p>}<p className="mt-2 text-[10px] leading-5 text-white/35">الإبلاغ يرسل الحالة للمراجعة. الحظر يمنع المسارات المدعومة على الخادم، وتُحاول الخدمة إزالة المستخدم المحظور من غرف الصوت المشتركة؛ يعتمد نجاح الإزالة الفورية على إعداد LiveKit وتحقق الخادم.</p></div>}

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

function ledgerLabel(type: string) {
  const labels: Record<string, string> = {
    match_reward: 'مكافأة مباراة',
    daily_bonus: 'مكافأة يومية',
    coin_purchase: 'شراء كوين',
    host_room_charge: 'خصم استضافة',
    ad_reward: 'مكافأة إعلان',
    refund: 'استرداد',
  };
  return labels[type] ?? type;
}
