import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, Copy, DoorOpen, LoaderCircle, Radio, Rocket, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { SpaceScene } from '../../components/lounge/SpaceScene';
import { getSpaceLoungeWorkerUrl } from '../../config/runtime';
import {
  createSpaceLoungeClaim,
  getActiveSpaceLoungeSession,
  getSpaceLoungeClaimStatus,
  moveSpaceLoungeParticipant,
  setSpaceLoungeGiftRules,
  setSpaceLoungeSponsor,
  spaceLoungeEventsUrl,
  startSpaceLoungeSession,
  stopSpaceLoungeSession,
  triggerSpaceLoungeSceneAction,
  type ClaimResponse,
} from '../../services/space-lounge/spaceLoungeApi';
import type { SpaceLoungeAction, SpaceLoungeSnapshot } from '../../types/space-lounge';
import '../../components/lounge/SpaceScene.css';

const previewParticipants = [
  { participantId: 'preview-1', displayName: 'رائد الفضاء', x: 37, y: 68, appearance: 'masculine' as const, action: 'DANCE' as const },
  { participantId: 'preview-2', displayName: 'نجمة المدار', x: 64, y: 63, appearance: 'feminine' as const, action: 'ZERO_GRAVITY' as const },
];

const actionLabels: Record<SpaceLoungeAction, string> = {
  DANCE: 'رقص',
  FLIP: 'شقلبة',
  RUN: 'جري',
  CHAOS: 'فوضى',
  ZERO_GRAVITY: 'انعدام الجاذبية',
};

const connectionLabels: Record<SpaceLoungeSnapshot['connection'], string> = {
  idle: 'غير متصل',
  connecting: 'جارٍ الاتصال',
  connected: 'اتصال Webcast مفتوح',
  reconnecting: 'يعيد الاتصال',
  offline: 'الاتصال متوقف',
};

function LoungeBackLink() {
  return (
    <Link to="/home" className="btn-ghost -mr-2 p-2" aria-label="العودة إلى الرئيسية">
      <ArrowRight className="h-5 w-5" />
    </Link>
  );
}

function useLoungeStream(sessionId: string | undefined, overlayToken: string | undefined) {
  const [snapshot, setSnapshot] = useState<SpaceLoungeSnapshot | null>(null);
  const [streamState, setStreamState] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle');

  useEffect(() => {
    if (!sessionId || !overlayToken || !getSpaceLoungeWorkerUrl()) {
      setSnapshot(null);
      setStreamState('idle');
      return undefined;
    }
    const controller = new AbortController();
    const streamUrl = spaceLoungeEventsUrl(sessionId);
    let retryCount = 0;
    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          setStreamState(retryCount ? 'reconnecting' : 'connecting');
          const response = await fetch(streamUrl, {
            headers: { Accept: 'text/event-stream', Authorization: `Bearer ${overlayToken}` },
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error(`stream_http_${response.status}`);
          setStreamState('connected');
          retryCount = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf('\n\n');
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary).replace(/\r/g, '');
              buffer = buffer.slice(boundary + 2);
              const lines = block.split('\n');
              const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
              const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
              if (eventName === 'snapshot' && data) setSnapshot(JSON.parse(data) as SpaceLoungeSnapshot);
              boundary = buffer.indexOf('\n\n');
            }
          }
          if (!controller.signal.aborted) throw new Error('stream_closed');
        } catch {
          if (controller.signal.aborted) break;
          setStreamState('reconnecting');
          const delay = Math.min(30_000, 1000 * (2 ** Math.min(retryCount, 5)));
          retryCount += 1;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
    };
    void connect();
    return () => controller.abort();
  }, [sessionId, overlayToken]);

  return { snapshot, streamState };
}

function statusLabel(state: 'idle' | 'connecting' | 'connected' | 'reconnecting') {
  if (state === 'connected') return 'قناة العرض مفتوحة؛ يلزم اختبار وصول الأحداث';
  if (state === 'reconnecting') return 'نعيد الاتصال بالمشهد…';
  if (state === 'connecting') return 'جارٍ فتح قناة المشهد…';
  return 'المشهد غير متصل';
}

function sponsorDisplay(snapshot: SpaceLoungeSnapshot | null) {
  if (!snapshot?.sponsor) return undefined;
  return snapshot.sponsor.message ? `${snapshot.sponsor.name} · ${snapshot.sponsor.message}` : snapshot.sponsor.name;
}

function buildShareLink(path: string, accessToken: string) {
  const url = new URL(path, window.location.origin);
  url.hash = new URLSearchParams({ access: accessToken }).toString();
  return url.toString();
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function SpaceLoungeScreen() {
  const workerUrl = getSpaceLoungeWorkerUrl();
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [joinKeyword, setJoinKeyword] = useState('SPACE');
  const [durationMinutes, setDurationMinutes] = useState(75);
  const [startData, setStartData] = useState<{ sessionId: string; overlayToken: string } | null>(null);
  const [snapshotFromStart, setSnapshotFromStart] = useState<SpaceLoungeSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(Boolean(workerUrl));
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [giftId, setGiftId] = useState('');
  const [giftAction, setGiftAction] = useState<SpaceLoungeAction>('DANCE');
  const [giftDuration, setGiftDuration] = useState(5);
  const [giftTarget, setGiftTarget] = useState<'sender' | 'group' | 'all'>('sender');
  const [groupAction, setGroupAction] = useState<SpaceLoungeAction>('DANCE');
  const [giftRules, setGiftRules] = useState<Array<{ giftId: string; action: SpaceLoungeAction; durationSeconds: number; target: 'sender' | 'group' | 'all' }>>([]);
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorMessage, setSponsorMessage] = useState('');

  useEffect(() => {
    if (!workerUrl) { setRecovering(false); return undefined; }
    let cancelled = false;
    setRecovering(true);
    void getActiveSpaceLoungeSession().then((activeSession) => {
      if (cancelled || !activeSession.session || !activeSession.overlayToken) return;
      setStartData({ sessionId: activeSession.session.sessionId, overlayToken: activeSession.overlayToken });
      setSnapshotFromStart(activeSession.session);
      setGiftRules(activeSession.giftRules);
      setSponsorName(activeSession.session.sponsor?.name || '');
      setSponsorMessage(activeSession.session.sponsor?.message || '');
      setMessage('استعيدت الجلسة النشطة وإعداداتها من العامل.');
    }).catch(() => {
      // Not configured or not an allowlisted host: keep the read-only preview available.
    }).finally(() => {
      if (!cancelled) setRecovering(false);
    });
    return () => { cancelled = true; };
  }, [workerUrl]);

  const { snapshot: liveSnapshot, streamState } = useLoungeStream(startData?.sessionId, startData?.overlayToken);
  const snapshot = liveSnapshot || snapshotFromStart;
  const observerLink = useMemo(() => startData ? buildShareLink(`/space-lounge/overlay/${startData.sessionId}`, startData.overlayToken) : '', [startData]);
  const participantLink = useMemo(() => startData ? `${window.location.origin}/space-lounge/control/${startData.sessionId}` : '', [startData]);

  const handleStart = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || recovering) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await startSpaceLoungeSession({ tiktokHandle, joinKeyword: joinKeyword.trim().toUpperCase(), durationMinutes, title: 'استراحة الفضاء' });
      setStartData({ sessionId: result.snapshot.sessionId, overlayToken: result.overlayToken });
      setSnapshotFromStart(result.snapshot);
      setGiftRules([]);
      setMessage('بدأت الجلسة؛ حالة الاتصال تظهر أعلى المشهد.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر بدء الجلسة.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!startData || busy) return;
    setBusy(true);
    try {
      await stopSpaceLoungeSession(startData.sessionId);
      setStartData(null);
      setSnapshotFromStart(null);
      setGiftRules([]);
      setMessage('انتهت الجلسة ومُسحت بيانات حضورها المؤقتة.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنهاء الجلسة.');
    } finally {
      setBusy(false);
    }
  };

  const handleGiftRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startData || !giftId.trim()) return;
    const next = [...giftRules.filter((rule) => rule.giftId !== giftId.trim()), { giftId: giftId.trim(), action: giftAction, durationSeconds: giftDuration, target: giftTarget }];
    setBusy(true);
    try {
      await setSpaceLoungeGiftRules(startData.sessionId, next);
      setGiftRules(next);
      setGiftId('');
      setMessage('حُفظت قاعدة الهدية لهذا البث فقط.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ قاعدة الهدية.');
    } finally {
      setBusy(false);
    }
  };

  const handleSponsor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startData) return;
    setBusy(true);
    try {
      await setSpaceLoungeSponsor(startData.sessionId, { name: sponsorName, message: sponsorMessage });
      setMessage('تم تحديث بطاقة الراعي.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تحديث بطاقة الراعي.');
    } finally {
      setBusy(false);
    }
  };

  const handleGroupAction = async () => {
    if (!startData) return;
    setBusy(true);
    try {
      const result = await triggerSpaceLoungeSceneAction(startData.sessionId, groupAction);
      setMessage(`بدأت الحركة الجماعية لعدد ${result.affected} مشارك.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تشغيل الحركة الجماعية.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyObserver = async () => {
    const success = await copyText(observerLink);
    setCopied(success);
    setMessage(success ? 'نُسخ رابط العرض.' : 'انسخ الرابط من الحقل يدويًا.');
  };

  const active = snapshot?.status === 'live';
  const preview = active && snapshot ? snapshot.participants : previewParticipants;

  return (
    <ScreenShell orbs={false} className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <LoungeBackLink />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">مساحة اجتماعية مستقلة</p>
          <h1 className="font-display text-2xl font-black text-white">استراحة الفضاء</h1>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${active && snapshot?.connection === 'connected' ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'}`}>
          <Sparkles className="h-3.5 w-3.5" />
          {active ? connectionLabels[snapshot?.connection || 'connecting'] : 'معاينة'}
        </span>
      </header>

      <main className="space-y-4">
        {!active ? (
          <section className="card space-y-4 p-4 sm:p-5">
            <div>
              <p className="eyebrow">مشهد واحد · دخول مجاني</p>
              <h2 className="font-display text-lg font-black text-white">ابدأ استراحة مستقلة عن التحديات والمواجهة</h2>
              <p className="mt-2 text-xs leading-6 text-white/50">هذه تجربة اجتماعية لا تضيف نقاطًا أو تغيّر نتائج المسابقات. يتصل العامل بحساب LIVE الذي تملكه أنت فقط.</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-[#070d1a] p-2 sm:p-3">
              <SpaceScene participants={preview} sponsorLabel="قدها · استراحة مدارية" />
            </div>
            <form onSubmit={handleStart} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold text-white/70">
                اسم حساب TikTok LIVE دون @
                <input value={tiktokHandle} onChange={(event) => setTiktokHandle(event.target.value)} required minLength={2} maxLength={24} pattern="[A-Za-z0-9._]{2,24}" placeholder="qaddaha" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/50" />
              </label>
              <label className="grid gap-2 text-xs font-bold text-white/70">
                كلمة دخول المشاهدين
                <input value={joinKeyword} onChange={(event) => setJoinKeyword(event.target.value.toUpperCase())} required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]{2,20}" className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm uppercase text-white outline-none focus:border-cyan-300/50" />
              </label>
              <label className="grid gap-2 text-xs font-bold text-white/70 sm:col-span-2">
                مدة الجلسة
                <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="rounded-xl border border-white/10 bg-[#111827] px-3 py-2.5 text-sm text-white">
                  <option value={60}>ساعة</option><option value={75}>ساعة و15 دقيقة</option><option value={90}>ساعة ونصف</option>
                </select>
              </label>
              <div className="sm:col-span-2">
                <button disabled={!workerUrl || busy || recovering} className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 disabled:cursor-not-allowed disabled:opacity-45">
                  {busy || recovering ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                  {recovering ? 'جارٍ استعادة حالة الجلسة' : workerUrl ? 'بدء استراحة LIVE' : 'بانتظار إعداد عامل البث'}
                </button>
                {!workerUrl ? <p className="mt-2 text-[11px] leading-5 text-amber-100/60">لم يضبط رابط الخدمة بعد؛ ستبقى هذه الصفحة معاينة ولن تحاول الاتصال.</p> : null}
              </div>
            </form>
          </section>
        ) : (
          <>
            <section className="card space-y-4 p-3 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <p className="eyebrow">{snapshot?.title || 'جلسة استراحة الفضاء'}</p>
                  <h2 className="font-display text-lg font-black text-white">{connectionLabels[snapshot?.connection || 'connecting']}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/65">{snapshot?.participants.length || 0} / 24 مشارك</span>
                  <button type="button" onClick={handleStop} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs font-bold text-rose-100 disabled:opacity-50">
                    <DoorOpen className="h-4 w-4" /> إنهاء الجلسة
                  </button>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-[#070d1a] p-2 sm:p-3">
                <SpaceScene participants={preview} sponsorLabel={sponsorDisplay(snapshot) || 'استراحة الفضاء'} />
              </div>
              <p className="px-1 text-xs leading-6 text-white/50">{statusLabel(streamState)} · كلمة دخول الجمهور: <strong className="text-cyan-100">{snapshot?.joinKeyword}</strong></p>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <article className="card space-y-3 p-4">
                <div className="flex items-center gap-2 text-cyan-100"><Copy className="h-4 w-4" /><h3 className="font-bold">روابط البث والمشارك</h3></div>
                <label className="grid gap-1.5 text-[11px] text-white/55">رابط OBS للقراءة فقط<input readOnly value={observerLink} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-[10px] text-white/75" /></label>
                <p className="text-[10px] leading-5 text-amber-100/60">الرابط يحمل رمز مشاهدة داخل fragment؛ شاركه مع OBS فقط ولا تنشره علنًا.</p>
                <button type="button" onClick={handleCopyObserver} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-50">{copied ? 'تم النسخ' : 'نسخ رابط OBS'}</button>
                <label className="grid gap-1.5 text-[11px] text-white/55">رابط التحكم الفردي<input readOnly value={participantLink} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-[10px] text-white/75" /></label>
                <p className="text-[10px] leading-5 text-white/40">يحرك المشارك شخصيته فقط بعد كتابة رمز التحقق في تعليق LIVE.</p>
              </article>

              <article className="card space-y-3 p-4">
                <div className="flex items-center gap-2 text-amber-100"><WandSparkles className="h-4 w-4" /><h3 className="font-bold">قاعدة هدية (اختيارية)</h3></div>
                <p className="text-[10px] leading-5 text-white/45">لا توجد هدايا مفعّلة مسبقًا. أدخل Gift ID الذي رصدته بنفسك؛ نرفض تخمين المعرفات.</p>
                <form onSubmit={handleGiftRule} className="grid grid-cols-2 gap-2">
                  <input value={giftId} onChange={(event) => setGiftId(event.target.value.replace(/\D/g, '').slice(0, 24))} placeholder="Gift ID الفعلي" className="col-span-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white" />
                  <select value={giftAction} onChange={(event) => setGiftAction(event.target.value as SpaceLoungeAction)} className="rounded-lg border border-white/10 bg-[#111827] px-2 py-2 text-xs text-white">
                    {Object.entries(actionLabels).map(([action, label]) => <option key={action} value={action}>{label}</option>)}
                  </select>
                  <select value={giftDuration} onChange={(event) => setGiftDuration(Number(event.target.value))} className="rounded-lg border border-white/10 bg-[#111827] px-2 py-2 text-xs text-white"><option value={3}>3 ثوانٍ</option><option value={5}>5 ثوانٍ</option><option value={8}>8 ثوانٍ</option></select>
                  <select value={giftTarget} onChange={(event) => setGiftTarget(event.target.value as 'sender' | 'group' | 'all')} className="col-span-2 rounded-lg border border-white/10 bg-[#111827] px-2 py-2 text-xs text-white"><option value="sender">المرسل</option><option value="group">مجموعة حول المرسل</option><option value="all">الجميع</option></select>
                  <button disabled={busy || !giftId} className="col-span-2 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-50 disabled:opacity-45">حفظ القاعدة لهذه الجلسة</button>
                </form>
                {giftRules.length ? <p className="text-[10px] text-emerald-100/75">قواعد مفعّلة: {giftRules.length}</p> : null}
              </article>

              <article className="card space-y-3 p-4">
                <div className="flex items-center gap-2 text-violet-100"><Sparkles className="h-4 w-4" /><h3 className="font-bold">بطاقة الراعي</h3></div>
                <form onSubmit={handleSponsor} className="grid gap-2">
                  <input value={sponsorName} onChange={(event) => setSponsorName(event.target.value.slice(0, 32))} placeholder="اسم الراعي" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white" />
                  <input value={sponsorMessage} onChange={(event) => setSponsorMessage(event.target.value.slice(0, 80))} placeholder="رسالة قصيرة اختيارية" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white" />
                  <button disabled={busy} className="rounded-xl border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-50">تحديث البطاقة</button>
                </form>
              </article>

              <article className="card space-y-3 p-4">
                <div className="flex items-center gap-2 text-cyan-100"><WandSparkles className="h-4 w-4" /><h3 className="font-bold">لحظة جماعية اختيارية</h3></div>
                <p className="text-[10px] leading-5 text-white/45">تُشغّل حركة واحدة للجميع لمدة خمس ثوانٍ؛ لا نقاط ولا ترتيب منافسة.</p>
                <div className="flex gap-2"><select value={groupAction} onChange={(event) => setGroupAction(event.target.value as SpaceLoungeAction)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111827] px-2 py-2 text-xs text-white">{Object.entries(actionLabels).map(([action, label]) => <option key={action} value={action}>{label}</option>)}</select><button type="button" onClick={() => void handleGroupAction()} disabled={busy} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-50 disabled:opacity-45">ابدأ</button></div>
              </article>

              <article className="card space-y-3 p-4">
                <div className="flex items-center gap-2 text-amber-100"><Check className="h-4 w-4" /><h3 className="font-bold">أبرز الداعمين في هذه الجلسة</h3></div>
                {snapshot?.topSupporters.length ? <ol className="space-y-2 text-xs text-white/75">{snapshot.topSupporters.map((supporter, index) => <li key={`${supporter.displayName}-${index}`} className="flex justify-between"><span>{index + 1}. {supporter.displayName}</span><span>{supporter.giftCount}</span></li>)}</ol> : <p className="text-[11px] text-white/40">سيظهر الترتيب هنا عند وصول هدايا عيّن لها المضيف حركة.</p>}
              </article>
            </section>
          </>
        )}

        {message ? <p role="status" className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs leading-5 text-white/75">{message}</p> : null}
        <section className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-cyan-100"><ShieldCheck className="h-4 w-4" /><strong className="text-sm">تفاعل عادل وآمن</strong></div><p className="text-xs leading-6 text-white/45">المشارك يحرك شخصيته فقط بعد إثبات الحساب برمز عابر للقنوات؛ المضيف يتحكم بالمشهد كاملًا.</p></article>
          <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="mb-2 flex items-center gap-2 text-violet-100"><Sparkles className="h-4 w-4" /><strong className="text-sm">جلسة بلا نقاط مسابقة</strong></div><p className="text-xs leading-6 text-white/45">الهدايا تشغّل حركات مرئية فقط؛ لا كوين ولا متجر ولا تغيير في نتائج المواجهات.</p></article>
        </section>
      </main>
    </ScreenShell>
  );
}

export function SpaceLoungeOverlayScreen() {
  const { token: sessionId } = useParams();
  const [accessToken, setAccessToken] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('access') || '';
    if (token) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      setAccessToken(token);
    }
  }, []);
  const validPath = /^[a-z0-9-]{16,80}$/i.test(sessionId || '');
  const { snapshot, streamState } = useLoungeStream(validPath ? sessionId : undefined, accessToken || undefined);
  const isConnected = streamState === 'connected';

  return (
    <main className="space-lounge-public" dir="rtl">
      <header className="space-lounge-public-header">
        <span className="space-live-indicator" style={{ background: isConnected ? '#45d39c' : undefined }} />
        <strong>استراحة الفضاء</strong>
        <span>{connectionLabels[snapshot?.connection || 'connecting']} · {statusLabel(streamState)}</span>
      </header>
      <SpaceScene participants={snapshot?.participants || []} emptyLabel={validPath && accessToken ? 'تستعد الساحة لاستقبال روّادها' : 'رابط المشهد غير صالح'} sponsorLabel={sponsorDisplay(snapshot)} />
      <p className="space-lounge-public-note" role="status">{snapshot ? `${snapshot.participants.length} مشارك في الساحة · دخول مجاني بكلمة ${snapshot.joinKeyword}` : 'المشهد للعرض فقط؛ لا تُرسل منه أوامر إلى المسابقة.'}</p>
    </main>
  );
}

export function SpaceLoungeControlScreen() {
  const { sessionId } = useParams();
  const validSessionPath = /^[a-z0-9-]{16,80}$/i.test(sessionId ?? '');
  const [claim, setClaim] = useState<ClaimResponse | null>(null);
  const [control, setControl] = useState<{ participantId: string; token: string } | null>(null);
  const [claimState, setClaimState] = useState('idle');
  const [position, setPosition] = useState({ x: 50, y: 66 });
  const [dragPosition, setDragPosition] = useState({ x: 50, y: 66 });
  const dragSurfaceRef = useRef<HTMLDivElement>(null);
  const dragActiveRef = useRef(false);
  const [appearance, setAppearance] = useState<'masculine' | 'feminine'>('masculine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!claim || !sessionId || control) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await getSpaceLoungeClaimStatus(sessionId, claim.claimId);
        if (cancelled) return;
        setClaimState(result.status);
        if (result.status === 'verified' && result.participantId && result.controlToken) {
          setControl({ participantId: result.participantId, token: result.controlToken });
          if (result.position) {
            setPosition(result.position);
            setDragPosition(result.position);
          }
          if (result.appearance) setAppearance(result.appearance);
          setClaim(null);
          return;
        }
        if (result.status === 'expired' || result.status === 'full' || result.status === 'not_found') {
          setClaim(null);
          return;
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'تعذر التحقق من الرمز.');
      }
      if (!cancelled) timer = window.setTimeout(() => { void poll(); }, 2000);
    };
    void poll();
    return () => { cancelled = true; if (timer !== undefined) window.clearTimeout(timer); };
  }, [claim, control, sessionId]);

  const handleClaim = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createSpaceLoungeClaim(sessionId);
      setClaim(result);
      setClaimState('pending');
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'تعذر طلب رمز التحقق.');
    } finally {
      setBusy(false);
    }
  };

  const savePosition = useCallback(async (next: { x: number; y: number }, nextAppearance = appearance) => {
    if (!sessionId || !control || busy) return;
    setBusy(true);
    setError('');
    try {
      await moveSpaceLoungeParticipant(sessionId, control.participantId, control.token, { ...next, appearance: nextAppearance });
      setPosition(next);
      setDragPosition(next);
      setAppearance(nextAppearance);
    } catch (moveError) {
      setDragPosition(position);
      setError(moveError instanceof Error ? moveError.message : 'تعذر تحريك الشخصية.');
    } finally {
      setBusy(false);
    }
  }, [appearance, busy, control, position, sessionId]);

  const move = useCallback((dx: number, dy: number, nextAppearance = appearance) => {
    const next = { x: Math.max(12, Math.min(88, position.x + dx)), y: Math.max(12, Math.min(88, position.y + dy)) };
    void savePosition(next, nextAppearance);
  }, [appearance, position.x, position.y, savePosition]);

  const dragPositionFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = dragSurfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return position;
    return {
      x: Math.max(12, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(12, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }, [position]);

  const handleDragStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!control || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragActiveRef.current = true;
    setDragPosition(dragPositionFromPointer(event));
  }, [busy, control, dragPositionFromPointer]);

  const handleDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragActiveRef.current) setDragPosition(dragPositionFromPointer(event));
  }, [dragPositionFromPointer]);

  const handleDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    const next = dragPositionFromPointer(event);
    setDragPosition(next);
    void savePosition(next);
  }, [dragPositionFromPointer, savePosition]);

  const handleDragCancel = useCallback(() => {
    if (!dragActiveRef.current) return;
    dragActiveRef.current = false;
    setDragPosition(position);
  }, [position]);

  return (
    <main className="space-lounge-control" dir="rtl">
      <section className="space-lounge-control-card">
        <span className="space-lounge-control-icon"><ShieldCheck className="h-6 w-6" /></span>
        <p className="eyebrow">تحكم خاص بشخصيتك</p>
        <h1 className="font-display text-2xl font-black text-white">{control ? 'أهلًا بك في المدار' : 'اربط حسابك بالبث'}</h1>
        {!validSessionPath ? <p className="mt-3 text-sm leading-7 text-rose-100/75">رابط الجلسة غير صالح أو انتهت صلاحيته.</p> : null}
        {validSessionPath && !claim && !control ? (
          <>
            <p className="mt-3 text-sm leading-7 text-white/55">اطلب رمزًا لمرة واحدة، ثم اكتبه بنفسك في تعليق TikTok LIVE؛ لا تستخدم اسم العرض وحده لإثبات الملكية.</p>
            <button type="button" onClick={handleClaim} disabled={busy} className="btn-primary mt-3 inline-flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />} اطلب رمز تحقق
            </button>
          </>
        ) : null}
        {claim ? (
          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
            <p className="text-xs leading-6 text-white/65">اكتب هذا الأمر حرفيًا في تعليق البث قبل انتهاء الرمز:</p>
            <code dir="ltr" className="my-3 block rounded-xl bg-black/25 px-3 py-4 text-2xl font-black tracking-[.24em] text-cyan-100">!verify {claim.code}</code>
            <p className="text-xs text-cyan-50/65">{claimState === 'pending' ? 'بانتظار ظهور تعليقك من TikTok…' : claim.instruction}</p>
          </div>
        ) : null}
        {control ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm leading-6 text-emerald-100/80">تم التحقق. يمكنك تحريك شخصيتك فقط، ويتم تحديث العرض مباشرة.</p>
            <p className="text-xs text-white/55">اسحب رمز مركبتك على خريطة المدار، ثم أفلت لتحديث موقع شخصيتك في المشهد الثلاثي الأبعاد.</p>
            <div
              ref={dragSurfaceRef}
              className="space-lounge-drag-pad"
              role="group"
              aria-label="خريطة مدار لسحب شخصيتك"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragCancel}
            >
              <span className="space-lounge-drag-orbit space-lounge-drag-orbit--outer" aria-hidden="true" />
              <span className="space-lounge-drag-orbit space-lounge-drag-orbit--inner" aria-hidden="true" />
              <button
                type="button"
                className="space-lounge-drag-handle"
                style={{ left: `${dragPosition.x}%`, top: `${dragPosition.y}%` }}
                aria-label="اسحب لتحريك شخصيتك"
                disabled={busy}
                onClick={(event) => event.preventDefault()}
              >
                <Rocket className="h-5 w-5 -rotate-45" aria-hidden="true" />
              </button>
              <span className="space-lounge-drag-caption" aria-hidden="true">مدار التحكم الشخصي</span>
            </div>
            <div className="mx-auto grid w-44 grid-cols-3 gap-2">
              <span /><button type="button" disabled={busy} onClick={() => void move(0, -7)} className="rounded-xl bg-white/10 p-3 text-white disabled:opacity-40">↑</button><span />
              <button type="button" disabled={busy} onClick={() => void move(-7, 0)} className="rounded-xl bg-white/10 p-3 text-white disabled:opacity-40">←</button><button type="button" disabled={busy} onClick={() => void move(0, 0)} className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-50">•</button><button type="button" disabled={busy} onClick={() => void move(7, 0)} className="rounded-xl bg-white/10 p-3 text-white disabled:opacity-40">→</button>
              <span /><button type="button" disabled={busy} onClick={() => void move(0, 7)} className="rounded-xl bg-white/10 p-3 text-white disabled:opacity-40">↓</button><span />
            </div>
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void move(0, 0, 'masculine')} className={`rounded-xl border px-3 py-2 text-xs ${appearance === 'masculine' ? 'border-cyan-200/30 bg-cyan-200/10 text-cyan-50' : 'border-white/10 text-white/55'}`}>بدلة المدار</button><button type="button" disabled={busy} onClick={() => void move(0, 0, 'feminine')} className={`rounded-xl border px-3 py-2 text-xs ${appearance === 'feminine' ? 'border-violet-200/30 bg-violet-200/10 text-violet-50' : 'border-white/10 text-white/55'}`}>بدلة النجمة</button></div>
            <p className="text-[10px] text-white/40">إذا أغلقت الصفحة ينتهي سرّ التحكم المحلي؛ اطلب رمزًا جديدًا لإعادة الربط.</p>
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] p-3 text-xs leading-5 text-rose-100/80">{error}</p> : null}
        <Link to="/space-lounge" className="btn-primary mt-6 inline-flex w-full justify-center gap-2 py-3"><Sparkles className="h-4 w-4" />زيارة استراحة الفضاء</Link>
        <Link to="/home" className="mt-4 inline-flex w-full justify-center text-sm text-white/45 hover:text-white/75">العودة إلى قدها</Link>
      </section>
    </main>
  );
}
