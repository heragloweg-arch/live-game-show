import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Mic, MicOff, Users, Volume2, Loader2,
  Wifi, WifiOff, LogIn, Sparkles,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  joinRoom, listParticipants,
  type RoomInfo, type RoomParticipant,
} from '../../services/livekit/voiceApi';
import { useLiveKitRoom } from '../../hooks/useLiveKitRoom';
import { RoomChallengePanel } from '../../components/room/RoomChallengePanel';
import { startRoomRealtime } from '../../services/realtime/roomRealtime';

export function RoomScreen() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [members, setMembers] = useState<RoomParticipant[]>([]);
  const [phase, setPhase] = useState<'join' | 'connecting' | 'inside' | 'error'>('join');
  const [codeInput, setCodeInput] = useState(roomId && roomId !== 'demo' && roomId !== 'join' ? roomId : '');
  const [err, setErr] = useState<string | null>(null);

  const voice = useLiveKitRoom();

  // If roomId looks like UUID, treat as direct room id
  const isUuid = !!roomId && /^[0-9a-f-]{36}$/i.test(roomId);

  useEffect(() => {
    if (isUuid && roomId && roomId !== 'join') {
      handleJoinById(roomId);
    }
    return () => {
      voice.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (phase !== 'inside' || !room) return;
    const refresh = async () => {
      try {
        const list = await listParticipants(room.id);
        setMembers(list);
      } catch { /* ignore */ }
    };
    void refresh();
    const stop = startRoomRealtime(room.id, {
      onRoomUpdate: (row) => {
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                status: (row.status as RoomInfo['status']) ?? prev.status,
                title: (row.title as string) || prev.title,
                code: (row.code as string) || prev.code,
              }
            : prev
        );
      },
      onParticipantChange: () => void refresh(),
      onRoundChange: () => void refresh(),
    });
    // Soft fallback poll every 15s if realtime lags
    const fallback = setInterval(() => void refresh(), 15000);
    return () => {
      stop();
      clearInterval(fallback);
    };
  }, [phase, room?.id]);

  async function handleJoinById(id: string) {
    setPhase('connecting');
    setErr(null);
    try {
      // We need to be a participant — if coming from host, already is
      setRoom({
        id,
        code: id.slice(0, 6).toUpperCase(),
        title: 'غرفة التحدي',
        status: 'live',
        hostId: '',
      });
      await voice.connect(id, false);
      const list = await listParticipants(id);
      setMembers(list);
      setPhase('inside');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  async function handleJoinByCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setPhase('connecting');
    setErr(null);
    try {
      const r = await joinRoom(code);
      setRoom(r);
      await voice.connect(r.id, false);
      const list = await listParticipants(r.id);
      setMembers(list);
      setPhase('inside');
      // Update URL without full navigation stack mess
      navigate(`/room/${r.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  // ── Join gate ──────────────────────────────────────────
  if (phase === 'join' || phase === 'error') {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-60" />
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card relative z-10 w-full max-w-sm p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-zatona-500/25 to-neon-purple/20">
            <Users className="h-8 w-8 text-zatona-400" />
          </div>
          <h2 className="mb-1 font-display text-xl font-bold">انضم لغرفة تحدي</h2>
          <p className="mb-6 text-sm text-white/45">أدخل كود الغرفة المكوّن من 6 أحرف</p>

          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
            maxLength={8}
            placeholder="XXXXXX"
            className="input-field mb-4 text-center font-display text-2xl font-black tracking-[0.3em]"
            dir="ltr"
          />

          {err && (
            <p className="mb-4 text-sm text-red-400">{err}</p>
          )}

          <button
            onClick={handleJoinByCode}
            disabled={!codeInput.trim()}
            className="btn-primary w-full gap-2 py-3.5"
          >
            <LogIn className="h-5 w-5" />
            انضم الآن
          </button>
          <Link to="/home" className="btn-ghost mt-3 block text-sm text-white/40">
            رجوع
          </Link>
        </motion.div>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-zatona-400" />
        <p className="text-white/50">جاري الانضمام والاتصال بالصوت...</p>
      </div>
    );
  }

  // ── Inside room ────────────────────────────────────────
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute -right-16 top-24 h-56 w-56 rounded-full bg-neon-purple/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-32 h-48 w-48 rounded-full bg-zatona-500/10 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between border-b border-white/5 px-4 py-3">
        <Link
          to="/home"
          className="btn-ghost p-2"
          onClick={() => voice.disconnect()}
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <p className="text-sm font-medium">{room?.title ?? 'غرفة التحدي'}</p>
          <p className="font-display text-xs tracking-widest text-white/40">
            {room?.code ?? roomId}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          LIVE
        </div>
      </header>

      <div className="relative z-10 flex-1 px-5 py-6">
        {/* Connection badge */}
        <div className="mb-4 flex items-center gap-2 text-xs text-white/40">
          {voice.isConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-zatona-400" />
              <span className="text-zatona-400">الصوت متصل</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>{voice.status === 'connecting' ? 'يتصل...' : 'غير متصل'}</span>
            </>
          )}
          <span className="mx-1">·</span>
          <Users className="h-3.5 w-3.5" />
          <span>{Math.max(members.length, voice.participants.length)} مشاركين</span>
        </div>

        {/* Participants grid */}
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence>
            {(members.length
              ? members
              : voice.participants.map((v) => ({
                  userId: v.identity,
                  isHost: false,
                  username: v.name,
                  displayName: v.name,
                  avatarUrl: null,
                  joinedAt: '',
                }))
            ).map((p, i) => {
              const vp = voice.participants.find((v) => v.identity === p.userId);
              const speaking = vp?.isSpeaking ?? false;
              return (
                <motion.div
                  key={p.userId}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'card relative flex flex-col items-center gap-2 p-4 transition-all duration-300',
                    speaking && 'border-zatona-500/60 shadow-glow scale-[1.02]'
                  )}
                >
                  <div
                    className={cn(
                      'relative flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold',
                      p.isHost
                        ? 'bg-gold-500/20 text-gold-400'
                        : 'bg-zatona-500/15 text-zatona-400'
                    )}
                  >
                    {(p.displayName || p.username)[0]}
                    {speaking && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-zatona-500/20" />
                    )}
                  </div>
                  <span className="max-w-full truncate text-sm font-medium">
                    {p.displayName || p.username}
                  </span>
                  {p.isHost && (
                    <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] text-gold-400">
                      مضيف
                    </span>
                  )}
                  {speaking && (
                    <Volume2 className="absolute left-2 top-2 h-3.5 w-3.5 text-zatona-400" />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Live challenge */}
        {room && (
          <div className="mt-4">
            <RoomChallengePanel roomId={room.id} isHost={false} />
          </div>
        )}

        {/* Waiting card */}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card mt-6 flex items-center gap-3 p-5"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zatona-500/15">
            <Sparkles className="h-5 w-5 text-zatona-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/80">في انتظار سؤال المضيف</p>
            <p className="text-xs text-white/35">
              الصوت يعمل عبر LiveKit · التوكن من السيرفر
            </p>
          </div>
        </motion.div>
      </div>

      {/* Bottom mic control */}
      <div className="safe-bottom relative z-10 border-t border-white/5 px-6 py-5">
        <div className="flex flex-col items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => voice.toggleMute()}
            disabled={!voice.isConnected}
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300',
              !voice.isConnected
                ? 'bg-white/5 opacity-40'
                : voice.isMuted
                ? 'bg-white/10'
                : 'bg-zatona-500 shadow-glow-lg'
            )}
          >
            {voice.isMuted ? (
              <MicOff className="h-7 w-7 text-white/60" />
            ) : (
              <Mic className="h-7 w-7 text-surface-900" />
            )}
          </motion.button>
          <p className="text-xs text-white/35">
            {!voice.isConnected
              ? 'الصوت غير متصل'
              : voice.isMuted
              ? 'اضغط لفتح الميكروفون'
              : 'الميكروفون مفتوح'}
          </p>
        </div>
      </div>
    </div>
  );
}
