import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/index.css';

const BUILD_ID = 'final-reviewed-content-20261006';
const root = document.getElementById('root');

function BootErrorScreen({ reason }: { reason: string }) {
  return (
    <main dir="rtl" className="boot-error-screen">
      <section className="boot-error-card">
        <p className="boot-kicker">QADDAHA BOOT CHECK</p>
        <h1>تعذر تشغيل قدها</h1>
        <p className="boot-copy">تم تشغيل نظام الحماية بدلاً من ترك شاشة سوداء. راجع إعدادات النشر التالية ثم أعد البناء.</p>
        <pre data-testid="boot-error">{reason}</pre>
        <p className="boot-build">build: {BUILD_ID}</p>
      </section>
    </main>
  );
}

function renderApp(App: React.ComponentType) {
  if (!root) throw new Error('Missing #root element');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
  root.dataset.mounted = 'true';
}

function renderBootError(reason: string) {
  if (!root) return;
  ReactDOM.createRoot(root).render(<BootErrorScreen reason={reason} />);
  root.dataset.mounted = 'true';
}

function getMissingProductionEnv() {
  const env = import.meta.env;
  const missing: string[] = [];
  if (env.PROD && (!env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL.includes('placeholder'))) missing.push('VITE_SUPABASE_URL');
  if (env.PROD && (!env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY.includes('placeholder'))) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
}

async function bootstrap() {
  // Render immediately. This prevents a failed optional import from ever leaving #root blank.
  if (root) {
    root.innerHTML = '';
    root.appendChild(Object.assign(document.createElement('div'), { innerHTML: '<div class="boot-loading-screen" dir="rtl"><div class="boot-loading-card"><div class="boot-logo-fallback">ق</div><p class="boot-kicker">QADDAHA</p><h1>قدها؟ ابدأ التحدي</h1><p>جاري تجهيز عالم التحديات...</p><span class="boot-progress"></span></div></div>' }).firstElementChild!);
  }

  try {
    const missing = getMissingProductionEnv();
    if (missing.length > 0) {
      renderBootError(`Missing production variables: ${missing.join(', ')}`);
      return;
    }

    // Optional shell services must never block React mounting.
    const [{ initTheme }, { initMonitoring }, { initNativeShell }] = await Promise.all([
      import('./store/themeStore'),
      import('./services/monitoring/sentry'),
      import('./app/capacitor'),
    ]);
    initTheme();
    initMonitoring();
    void initNativeShell().catch(() => undefined);

    const { default: App } = await import('./App');
    renderApp(App);
  } catch (error) {
    renderBootError(error instanceof Error ? error.message : String(error));
  }
}

void bootstrap();
