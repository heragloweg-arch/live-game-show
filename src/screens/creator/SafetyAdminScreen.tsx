import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Eye, Loader2, X } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { fetchAdminReports, reviewAdminReport, type SafetyAdminReport } from '../../services/api/safetyApi';

const categoryLabels: Record<SafetyAdminReport['category'], string> = {
  harassment: 'تحرش أو إساءة', hate: 'خطاب كراهية', sexual_content: 'محتوى جنسي', spam: 'رسائل مزعجة',
  cheating: 'غش', unsafe_content: 'محتوى غير آمن', other: 'سبب آخر',
};
const targetLabels: Record<SafetyAdminReport['target_type'], string> = { user: 'مستخدم', match: 'مباراة', room: 'غرفة', challenge: 'سؤال/تحدٍ' };

export function SafetyAdminScreen() {
  const [items, setItems] = useState<SafetyAdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await fetchAdminReports(); setItems(result.items ?? []); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل البلاغات.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const review = async (report: SafetyAdminReport, status: 'reviewing' | 'resolved' | 'dismissed') => {
    const note = status === 'reviewing' ? '' : window.prompt('ملاحظة المراجعة (اختياري):', '');
    if (note === null) return;
    setBusyId(report.id); setError(null); setNotice(null);
    try {
      await reviewAdminReport(report.id, status, note);
      setNotice(status === 'reviewing' ? 'تم تسجيل بدء المراجعة.' : status === 'resolved' ? 'تم إغلاق البلاغ كمعالج.' : 'تم إغلاق البلاغ كمرفوض.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر حفظ المراجعة.'); }
    finally { setBusyId(null); }
  };
  return <ScreenShell>
    <header className="mb-6 flex items-center gap-3">
      <Link to="/home" className="btn-ghost -mr-2 p-2"><ArrowRight className="h-5 w-5" /></Link>
      <div className="min-w-0 flex-1"><h1 className="font-display text-xl font-black">مراجعة بلاغات السلامة</h1><p className="text-xs text-white/45">تُتحقق الصلاحيات على الخادم؛ الواجهة لا تمنح صلاحية مشرف.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary px-3 py-2 text-xs">تحديث</button>
    </header>
    {error && <p role="alert" className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</p>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div> : <div className="space-y-3">
      {items.length === 0 && <p className="card p-6 text-center text-sm text-white/45">لا توجد بلاغات معلقة للمراجعة.</p>}
      {items.map((item) => <article key={item.id} className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-100">{categoryLabels[item.category]}</span><span className="text-[10px] text-white/40">{new Date(item.created_at).toLocaleString('ar')}</span></div>
        <div className="grid grid-cols-1 gap-2 text-xs text-white/55 sm:grid-cols-2"><p>الهدف: {targetLabels[item.target_type]} · <span dir="ltr">{item.target_id}</span></p><p>المبلّغ: <span dir="ltr">{item.reporter_id}</span></p><p>الحالة: {item.status === 'pending' ? 'جديد' : 'قيد المراجعة'}</p></div>
        {item.details && <p className="whitespace-pre-wrap rounded-lg bg-black/15 p-3 text-sm leading-6 text-white/80">{item.details}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busyId === item.id || item.status === 'reviewing'} onClick={() => void review(item, 'reviewing')} className="btn-secondary gap-2 px-3 py-2 text-xs">{busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}بدء المراجعة</button>
          <button type="button" disabled={busyId === item.id} onClick={() => void review(item, 'resolved')} className="btn-primary gap-2 px-3 py-2 text-xs"><Check className="h-3.5 w-3.5" />تمت المعالجة</button>
          <button type="button" disabled={busyId === item.id} onClick={() => void review(item, 'dismissed')} className="btn-secondary gap-2 px-3 py-2 text-xs text-red-200"><X className="h-3.5 w-3.5" />رفض البلاغ</button>
        </div>
      </article>)}
    </div>}
  </ScreenShell>;
}
