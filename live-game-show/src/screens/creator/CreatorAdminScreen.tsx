import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { supabase } from '../../services/supabase/client';

const BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creator`
  : '';

export function CreatorAdminScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('سجّل الدخول');
      // list pending via direct table if RLS allows service; else use edge list_pending
      const res = await fetch(BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ action: 'list_pending' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل التحميل');
      setItems(json.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ action: 'approve', id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'فشل الاعتماد');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/creator" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
        <div>
          <h1 className="font-display text-xl font-black">مراجعة المبدعين</h1>
          <p className="text-xs text-white/45">أدمن فقط · اعتماد الأسئلة للبنك</p>
        </div>
      </header>
      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-center text-sm text-white/40">لا طلبات معلّقة</p>}
          {items.map((it) => (
            <div key={it.id} className="card space-y-2 p-4">
              <p className="text-sm text-white/90">{it.prompt}</p>
              <p className="text-[11px] text-white/40">إجابات: {(it.accepted_answers || []).join(' · ')}</p>
              <button
                type="button"
                className="btn-primary w-full gap-2 text-sm"
                disabled={busyId === it.id}
                onClick={() => void approve(it.id)}
              >
                {busyId === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                اعتماد ونشر
              </button>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}
