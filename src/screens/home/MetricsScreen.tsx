/**
 * Investor Data Room — live warehouse + client funnel + snapshots
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Briefcase, Download, Loader2, RefreshCw } from 'lucide-react';
import {
  getAnalyticsBuffer,
  summarizeFunnel,
  getRetentionSnapshot,
} from '../../services/analytics/events';
import { SOFT_LAUNCH } from '../../config/softLaunch';
import {
  metricsOverview,
  metricsIngestDay,
  metricsSnapshot,
  metricsListSnapshots,
} from '../../services/api/metricsApi';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { BRAND } from '../../config/brand';

export function MetricsScreen() {
  const [overview, setOverview] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const summary = useMemo(() => summarizeFunnel(), []);
  const retention = useMemo(() => getRetentionSnapshot(), []);
  const recent = useMemo(() => getAnalyticsBuffer().slice(-40).reverse(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([metricsOverview(), metricsListSnapshots()]);
      setOverview(o);
      setSnapshots(s.snapshots ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pushDay = async () => {
    setBusy(true);
    try {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
      await metricsIngestDay({
        day,
        dau: 1,
        matches_started: summary.counts.match_start ?? 0,
        matches_finished: summary.counts.match_finish ?? 0,
        ad_impressions: summary.counts.ad_impression ?? 0,
      });
      setMsg('تم دفع ملخص اليوم للمستودع');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSnapshot = async () => {
    setBusy(true);
    try {
      await metricsSnapshot({
        label: `قدها-${new Date().toISOString().slice(0, 16)}`,
        funnel: summary,
        retention,
        notes: 'من شاشة المستثمر داخل التطبيق',
      });
      setMsg('تم حفظ لقطة مستثمر');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ov = overview?.overview;

  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-display text-xl font-black text-gradient">غرفة بيانات المستثمر</h1>
          <p className="text-[11px] text-white/40">{BRAND.name} · Soft Launch Data Room</p>
        </div>
        <button type="button" onClick={() => void load()} className="btn-ghost p-2">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </button>
      </header>

      {msg && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">{msg}</div>
      )}

      <div className="mb-4 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void pushDay()} className="btn-secondary flex-1 py-2.5 text-xs">
          دفع إحصاء اليوم
        </button>
        <button type="button" disabled={busy} onClick={() => void saveSnapshot()} className="btn-primary flex-1 gap-1 py-2.5 text-xs">
          <Briefcase className="h-3.5 w-3.5" />
          لقطة مستثمر
        </button>
      </div>

      {loading && !overview ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              ['المستخدمون', ov?.totalUsers],
              ['المباريات', ov?.totalMatches],
              ['مكتملة', ov?.finishedMatches],
              ['غرف', ov?.rooms],
              ['ثنائيات نشطة', ov?.activeCouples],
              [
                'إكمال %',
                ov?.matchCompletionRate != null
                  ? Math.round(ov.matchCompletionRate * 100)
                  : '—',
              ],
            ].map(([label, val]) => (
              <div key={String(label)} className="card px-3 py-3">
                <p className="text-[10px] text-white/40">{label}</p>
                <p className="font-display text-xl font-bold text-white">{val ?? '—'}</p>
              </div>
            ))}
          </div>

          <div className="card mb-4 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-300">
              <BarChart3 className="h-4 w-4" />
              بوابات الجودة
            </div>
            <ul className="space-y-1 text-xs text-white/55">
              <li>إكمال مباراة ≥ {SOFT_LAUNCH.qualityGates.minMatchCompletionRate * 100}%</li>
              <li>D1 مستهدف ≥ {SOFT_LAUNCH.qualityGates.targetD1Retention * 100}%</li>
              <li>أسواق: {SOFT_LAUNCH.regions.join(' · ').toUpperCase()}</li>
              <li>
                الحالة:{' '}
                {ov?.matchCompletionRate != null &&
                ov.matchCompletionRate >= SOFT_LAUNCH.qualityGates.minMatchCompletionRate
                  ? '✅ قرب بوابة الإكمال'
                  : '⚠️ تحت المراقبة'}
              </li>
            </ul>
          </div>

          <div className="card mb-4 p-4">
            <p className="mb-2 text-sm font-semibold">آخر 14 يوماً (مستودع)</p>
            <div className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
              {(overview?.last14Days ?? []).length === 0 && (
                <p className="text-white/35">لا صفوف بعد — اضغط «دفع إحصاء اليوم» بعد اللعب.</p>
              )}
              {(overview?.last14Days ?? []).map((d: any) => (
                <div key={d.day} className="flex justify-between border-b border-white/5 py-1 text-white/60">
                  <span>{d.day}</span>
                  <span>
                    M {d.matches_finished}/{d.matches_started} · Ad {d.ad_impressions}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card mb-4 p-4">
        <p className="mb-2 text-sm font-semibold">احتفاظ هذا الجهاز</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-white/55">
          <div className="rounded-lg bg-white/5 px-2 py-1.5">أيام: <b className="text-white">{retention.uniqueDays}</b></div>
          <div className="rounded-lg bg-white/5 px-2 py-1.5">اليوم #: <b className="text-white">{retention.dayNumber}</b></div>
          <div className="rounded-lg bg-white/5 px-2 py-1.5">D1: <b className="text-amber-300">{retention.returnedD1 ? 'نعم' : 'لا'}</b></div>
          <div className="rounded-lg bg-white/5 px-2 py-1.5">D7: <b className="text-amber-300">{retention.returnedD7 ? 'نعم' : 'لا'}</b></div>
        </div>
      </div>

      <div className="card mb-4 p-4">
        <p className="mb-2 text-sm font-semibold">قمع الجلسة (عميل)</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(summary.counts).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px]">
              <span className="text-white/40">{k}</span>
              <span className="mr-2 font-bold text-violet-300">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-4 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Download className="h-4 w-4" />
          لقطات المستثمر المحفوظة
        </p>
        <div className="max-h-36 space-y-1 overflow-y-auto text-[11px] text-white/50">
          {snapshots.length === 0 && <p>لا لقطات بعد.</p>}
          {snapshots.map((s) => (
            <div key={s.id} className="flex justify-between border-b border-white/5 py-1">
              <span className="text-white/70">{s.label}</span>
              <span>{new Date(s.created_at).toLocaleString('ar')}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">آخر الأحداث المحلية</p>
        <div className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-white/50">
          {recent.length === 0 && <p>لا أحداث — العب جولة.</p>}
          {recent.map((e, i) => (
            <div key={i} className="flex justify-between gap-2 border-b border-white/5 py-1">
              <span className="text-white/70">{e.name}</span>
              <span>{new Date(e.at).toLocaleTimeString('ar')}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}
