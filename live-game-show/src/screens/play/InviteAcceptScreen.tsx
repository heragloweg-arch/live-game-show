import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { acceptMatchInvite } from '../../services/api/matchApi';

export function InviteAcceptScreen() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const r = await acceptMatchInvite(token);
        if (cancelled) return;
        const id = (r as any).match?.matchId || (r as any).match?.id;
        if (id) navigate(`/match/${id}`, { replace: true });
        else setErr('تعذر قبول الدعوة');
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost p-2"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="font-display text-xl font-bold">دعوة 1 ضد 1</h1>
      </header>
      {busy && (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-violet-400" />
          <p className="text-white/50">جاري الانضمام…</p>
        </div>
      )}
      {err && (
        <div className="card p-4 text-center">
          <p className="text-red-300">{err}</p>
          <Link to="/play" className="btn-primary mt-4 inline-flex">اللعب من الرئيسية</Link>
        </div>
      )}
    </ScreenShell>
  );
}
