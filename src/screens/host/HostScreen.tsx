import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Mic, MicOff, Users, Play, Copy, Check,
  Radio, Square, Loader2, Sparkles, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  createRoom, goLive, endRoom, listParticipants,
  type RoomInfo, type RoomParticipant,
} from '../../services/livekit/voiceApi';
import { useLiveKitRoom } from '../../hooks/useLiveKitRoom';
import { RoomChallengePanel } from '../../components/room/RoomChallengePanel';
import {
  HostShowDirector,
  type ShowStage,
} from '../../components/host/HostShowDirector';
import { track } from '../../services/analytics/events';
import { startRoomRealtime } from '../../services/realtime/roomRealtime';
import { isHostProActive } from '../../services/billing/entitlements';

type HostPhase = 'setup' | 'lobby' | 'live' | 'ended';

export function HostScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<HostPhase>('setup');
  const [title, setTitle] = useState('تحدي قدها المباشر');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [members, setMembers] = useState<RoomParticipant[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showStage, setShowStage] = useState<ShowStage>('intro');

  const voice = useLiveKitRoom();

  const refreshMembers = useCallback(async () => {
    if (!room) return;
    try {
      const list = await listParticipants(room.id);
      setMembers(list);
    } catch { /* ignore */ }
  }, [room]);

  useEffect(() => {
    if ((phase === 'lobby' || phase === 'live') && room) {
      void refreshMembers();
      const stop = startRoomRealtime(room.id, {
        onParticipantChange: () => void refreshMembers(),
        onRoomUpdate: (row) => {
          setRoom((prev) =>
            prev
              ? { ...prev, status: (row.status as any) ?? prev.status }
              : prev
          );
        },
      });
      const fallback = setInterval(() => void refreshMembers(), 15000);
      return () => {
        stop();
        clearInterval(fallback);
      };
    }
  }, [phase, room?.id, refreshMembers]);

  const hostPro = isHostProActive();
  // Soft gate: warn in UI; hard gate when server REQUIRE_HOST_PRO=true

  const handleCreate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await createRoom(title.trim() || 'تحدي قدها المباشر');
      setRoom(r);
      setPhase('lobby');
      track('host_create', { roomId: r.id });
      // Pre-connect voice as host (publish enabled)
      await voice.connect(r.id, true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleGoLive = async () => {
    if (!room) return;
    setBusy(true);
    setErr(null);
    try {
      await goLive(room.id);
      setRoom({ ...room, status: 'live' });
      setPhase('live');
      setShowStage('intro');
      track('host_go_live', { roomId: room.id });
      if (!voice.isConnected) await voice.connect(room.id, true);
      await voice.setMuted(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!room) return;
    setBusy(true);
    try {
      await endRoom(room.id);
      await voice.disconnect();
      setPhase('ended');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-5 pb-12 pt-6">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-zatona-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-40 h-48 w-48 rounded-full bg-gold-500/10 blur-3xl" />

      <header className="relative z-10 mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2" onClick={() => voice.disconnect()}>
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">لوحة المضيف</h1>
          <p className="text-xs text-white/45">Host · LiveKit Voice</p>
        </div>
        <AnimatePresence>
          {phase === 'live' && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              مباشر
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      {err && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {err}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {/* SETUP */}
        {phase === 'setup' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="relative z-10"
          >
            <div className="card mb-6 overflow-hidden p-6">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-500/30 to-zatona-500/20">
                <Sparkles className="h-7 w-7 text-gold-400" />
              </div>
              <h2 className="mb-1 font-display text-xl font-bold">أنشئ غرفة تحدي</h2>
              <p className="mb-5 text-sm text-white/50">
                استضف جولة مباشرة مع صوت LiveKit. شارك الكود مع اللاعبين.
              </p>
              <label className="mb-2 block text-sm text-white/50">عنوان التحدي</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field mb-5"
                placeholder="مثال: تحدي المعلومات العامة"
                dir="rtl"
              />
              <button
                onClick={handleCreate}
                disabled={busy}
                className="btn-primary w-full gap-2 py-4 text-lg"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
                إنشاء الغرفة
              </button>
            </div>
          </motion.div>
        )}

        {/* LOBBY + LIVE share layout */}
        {(phase === 'lobby' || phase === 'live') && room && (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 space-y-4"
          >
            {/* Room code */}
            <div className="card relative overflow-hidden p-5">
              <div className="absolute inset-0 bg-gradient-to-l from-zatona-500/5 to-transparent" />
              <div className="relative">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-white/50">كود الغرفة</span>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zatona-400 transition-colors hover:bg-white/10"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'تم النسخ' : 'نسخ'}
                  </button>
                </div>
                <p className="font-display text-4xl font-black tracking-[0.35em] text-gradient">
                  {room.code}
                </p>
                <p className="mt-2 text-sm text-white/40">{room.title}</p>
              </div>
            </div>

            {/* Voice status */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-surface-800/60 px-4 py-3">
              {voice.isConnected ? (
                <Wifi className="h-4 w-4 text-zatona-400" />
              ) : voice.status === 'connecting' ? (
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              ) : (
                <WifiOff className="h-4 w-4 text-white/30" />
              )}
              <span className="flex-1 text-sm text-white/60">
                {voice.isConnected
                  ? 'الصوت متصل'
                  : voice.status === 'connecting'
                  ? 'جاري الاتصال بالصوت...'
                  : voice.error
                  ? `صوت: ${voice.error}`
                  : 'الصوت غير متصل'}
              </span>
              {voice.isConnected && (
                <button
                  onClick={() => voice.toggleMute()}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full transition-all',
                    voice.isMuted ? 'bg-white/10' : 'bg-zatona-500 shadow-glow'
                  )}
                >
                  {voice.isMuted ? (
                    <MicOff className="h-4 w-4 text-white/60" />
                  ) : (
                    <Mic className="h-4 w-4 text-surface-900" />
                  )}
                </button>
              )}
            </div>

            {/* Participants */}
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-zatona-400" />
                <span className="text-sm font-medium">
                  المشاركون ({Math.max(members.length, voice.participants.length)})
                </span>
              </div>
              <div className="space-y-2">
                {(members.length ? members : [{
                  userId: 'me', isHost: true, username: 'أنت', displayName: 'أنت (المضيف)',
                  avatarUrl: null, joinedAt: '',
                }]).map((p) => {
                  const vp = voice.participants.find((v) => v.identity === p.userId);
                  return (
                    <div
                      key={p.userId}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all',
                        vp?.isSpeaking ? 'bg-zatona-500/15 ring-1 ring-zatona-500/40' : 'bg-white/5'
                      )}
                    >
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-zatona-500/20 text-sm font-bold text-zatona-400">
                        {(p.displayName || p.username)[0]}
                        {vp?.isSpeaking && (
                          <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-zatona-400" />
                        )}
                      </div>
                      <span className="flex-1 text-sm">{p.displayName || p.username}</span>
                      {p.isHost && (
                        <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] font-bold text-gold-400">
                          مضيف
                        </span>
                      )}
                      {vp && !vp.isMuted && (
                        <Mic className="h-3.5 w-3.5 text-zatona-400" />
                      )}
                    </div>
                  );
                })}
                {phase === 'lobby' && members.length <= 1 && (
                  <p className="py-3 text-center text-xs text-white/30">
                    شارك الكود وانتظر انضمام اللاعبين...
                  </p>
                )}
              </div>
            </div>

            {/* Live challenges */}
            {(phase === 'live' || phase === 'lobby') && room && (
              <>
                {phase === 'live' && (
                  <div className="mb-4">
                    <HostShowDirector
                      stage={showStage}
                      onStageChange={setShowStage}
                      participantCount={members.length}
                      isLive
                    />
                  </div>
                )}
                <RoomChallengePanel roomId={room.id} isHost />
              </>
            )}

            {/* Actions */}
            {phase === 'lobby' && (

              <button
                onClick={handleGoLive}
                disabled={busy}
                className="btn-primary w-full gap-3 py-4 text-lg"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                ابدأ البث المباشر
              </button>
            )}

            {phase === 'live' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate(`/room/${room.id}`)}
                  className="btn-secondary gap-2 py-3.5"
                >
                  <Radio className="h-4 w-4" />
                  عرض الغرفة
                </button>
                <button
                  onClick={handleEnd}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-3.5 font-semibold text-red-400 transition-all active:scale-[0.98]"
                >
                  <Square className="h-4 w-4" />
                  إنهاء
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ENDED */}
        {phase === 'ended' && (
          <motion.div
            key="ended"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative z-10 card p-8 text-center"
          >
            <h2 className="mb-2 font-display text-2xl font-bold">انتهى البث</h2>
            <p className="mb-6 text-sm text-white/50">شكراً لاستضافتك على قدها</p>
            <button
              onClick={() => {
                setRoom(null);
                setMembers([]);
                setPhase('setup');
              }}
              className="btn-primary w-full"
            >
              بث جديد
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
