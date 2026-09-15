import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Swords, Users, Copy } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import {
  teamPickup,
  teamPickupCancel,
  teamCancelQueue,
  teamCreate,
  teamJoin,
  teamLeave,
  teamMine,
  teamQueue,
  teamQueueStatus,
  teamSetSize,
} from '../../services/api/teamApi';

const SIZES = [1, 2, 3, 5, 8, 10, 15];

export function TeamScreen() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('فريق قدها');
  const [size, setSize] = useState(5);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await teamMine();
      setTeam(r.team);
      setMembers(r.members ?? []);
      setRole(r.role ?? null);
      if (r.team?.max_members) setSize(r.team.max_members);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!team || queueStatus === 'idle' || queueStatus === 'matched') return;
    const t = setInterval(async () => {
      try {
        const s = await teamQueueStatus();
        setQueueStatus(s.status);
        if (s.status === 'matched' && s.matchId) {
          navigate(`/match/${s.matchId}`);
        }
      } catch { /* */ }
    }, 2500);
    return () => clearInterval(t);
  }, [team, queueStatus, navigate]);

  return (
    <ScreenShell>
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="absolute -right-10 bottom-20 h-48 w-48 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-black text-gradient">معارك الفرق</h1>
          <p className="text-xs text-white/45">من 1 ضد 1 حتى 15 ضد 15 · مجموع نقاط الفريق</p>
        </div>
      </header>

      {err && <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>}
      {msg && <p className="mb-3 text-sm text-sky-200">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>
      ) : team ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="card-glow relative overflow-hidden p-5">
            <div className="relative z-10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{team.name}</h2>
                  <p className="mt-1 text-sm text-white/50">
                    حجم الفريق: <b className="text-white">{team.max_members}</b> · الأعضاء: {members.length}
                  </p>
                </div>
                <Users className="h-8 w-8 text-sky-400/80" />
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
                <span className="text-xs text-white/40">رمز الدعوة</span>
                <b className="flex-1 tracking-[0.3em] text-amber-300">{team.invite_code}</b>
                <button
                  type="button"
                  className="btn-ghost p-1.5"
                  onClick={() => void navigator.clipboard.writeText(team.invite_code)}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <p className="mb-2 text-sm font-semibold text-white/80">الأعضاء</p>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 text-sm">
                  <span>{m.profile?.display_name || m.profile?.username || m.user_id.slice(0, 8)}</span>
                  <span className="text-[11px] text-white/40">{m.role === 'owner' ? 'قائد' : 'عضو'}</span>
                </li>
              ))}
            </ul>
          </div>

          {role === 'owner' && (
            <div className="card space-y-3 p-4">
              <p className="text-sm font-semibold">حجم المواجهة (1–15)</p>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={async () => {
                      setSize(s);
                      setBusy(true);
                      try {
                        await teamSetSize(s);
                        await load();
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className={`rounded-xl px-3 py-1.5 text-sm font-bold ${
                      size === s ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {s}v{s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={busy || queueStatus === 'queued'}
                className="btn-primary w-full gap-2"
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    const r = await teamQueue('normal');
                    setQueueStatus(r.status);
                    setMsg(r.message ?? null);
                    if (r.status === 'matched' && r.matchId) navigate(`/match/${r.matchId}`);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Swords className="h-4 w-4" />
                {queueStatus === 'queued' ? 'جاري البحث عن فريق…' : `ابحث عن مباراة ${size} ضد ${size}`}
              </button>
              {queueStatus === 'queued' && (
                <button
                  type="button"
                  className="btn-ghost w-full text-sm"
                  onClick={async () => {
                    await teamCancelQueue();
                    setQueueStatus('idle');
                    setMsg(null);
                  }}
                >
                  إلغاء البحث
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn-ghost w-full text-sm text-red-300/80"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await teamLeave();
                setTeam(null);
                setMembers([]);
                setQueueStatus('idle');
              } catch (e) {
                setErr(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            مغادرة الفريق
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">

          <div className="card space-y-3 border border-amber-500/20 p-5">
            <p className="font-display text-lg font-bold text-amber-200">تجميع سريع (أفراد)</p>
            <p className="text-xs text-white/45">انضم لطابور حتى يكتمل عدد اللاعبين لنفس الحجم ثم يُشكَّل فريق تلقائياً</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button key={`p-${s}`} type="button" onClick={() => setSize(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${size === s ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/50'}`}>
                  {s}v{s}
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary w-full" disabled={busy}
              onClick={async () => {
                setBusy(true); setErr(null); setMsg(null);
                try {
                  const r = await teamPickup(size, 'normal');
                  setMsg(r.message || (r.status === 'waiting' ? `بالانتظار ${r.waiting}/${r.need}` : r.status));
                  if (r.status === 'team_ready') await load();
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                finally { setBusy(false); }
              }}>انضم للتجميع</button>
          </div>

          <div className="card space-y-3 p-5">
            <p className="font-display text-lg font-bold">أنشئ فريقك</p>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفريق" />
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    size === s ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {s}v{s}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await teamCreate(name, size);
                  await load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              إنشاء
            </button>
          </div>
          <div className="card space-y-3 p-5">
            <p className="font-bold">انضم برمز</p>
            <input
              className="input-field text-center tracking-[0.35em]"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
            />
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy || code.length < 4}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  await teamJoin(code);
                  await load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              انضمام
            </button>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
