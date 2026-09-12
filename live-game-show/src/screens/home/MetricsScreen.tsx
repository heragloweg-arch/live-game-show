/**
 * Internal Soft Launch metrics snapshot (client buffer).
 * Replace with server warehouse for real investor reports.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3 } from 'lucide-react';
import { getAnalyticsBuffer, summarizeFunnel } from '../../services/analytics/events';
import { SOFT_LAUNCH } from '../../config/softLaunch';

export function MetricsScreen() {
  const summary = useMemo(() => summarizeFunnel(), []);
  const recent = useMemo(() => getAnalyticsBuffer().slice(-30).reverse(), []);

  return (
    <div className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">مقاييس Soft Launch</h1>
      </header>

      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zatona-400">
          <BarChart3 className="h-4 w-4" />
          بوابة الجودة
        </div>
        <ul className="space-y-1 text-xs text-white/55">
          <li>إكمال مباراة ≥ {SOFT_LAUNCH.qualityGates.minMatchCompletionRate * 100}%</li>
          <li>D1 مستهدف ≥ {SOFT_LAUNCH.qualityGates.targetD1Retention * 100}%</li>
          <li>أسواق: {SOFT_LAUNCH.regions.join(' · ').toUpperCase()}</li>
        </ul>
      </div>

      <div className="card mb-4 p-4">
        <p className="mb-2 text-sm font-semibold">ملخص الجلسة الحالية</p>
        <p className="text-xs text-white/45">
          معدل إكمال تقريبي:{' '}
          {summary.matchCompletionRate == null
            ? '—'
            : `${Math.round(summary.matchCompletionRate * 100)}%`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(summary.counts).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px]">
              <span className="text-white/40">{k}</span>
              <span className="mr-2 font-bold text-zatona-400">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <p className="mb-2 text-sm font-semibold">آخر الأحداث</p>
        <div className="max-h-64 space-y-1 overflow-y-auto text-[11px] text-white/50">
          {recent.length === 0 && <p>لا أحداث بعد — العب جولة لتظهر هنا.</p>}
          {recent.map((e, i) => (
            <div key={i} className="flex justify-between gap-2 border-b border-white/5 py-1">
              <span className="text-white/70">{e.name}</span>
              <span>{new Date(e.at).toLocaleTimeString('ar')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
