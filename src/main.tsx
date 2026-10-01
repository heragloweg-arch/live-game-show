import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initTheme } from './store/themeStore';
import { initMonitoring } from './services/monitoring/sentry';
import './styles/index.css';
import { initNativeShell } from './app/capacitor';

const BUILD_ID = 'final-reviewed-content-20260930';

function BootErrorScreen({ reason }: { reason: string }) {
  return (
    <main dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#0b0f1a', color: '#f8fafc', fontFamily: 'Cairo, system-ui, sans-serif' }}>
      <section style={{ width: 'min(100%, 560px)', padding: '28px', border: '1px solid rgba(255,255,255,.14)', borderRadius: '24px', background: 'rgba(20,27,44,.92)', boxShadow: '0 24px 80px rgba(0,0,0,.35)' }}>
        <p style={{ color: '#fbbf24', fontWeight: 800, letterSpacing: '.08em' }}>QADDAHA BOOT CHECK</p>
        <h1 style={{ margin: '10px 0', fontSize: '28px' }}>تعذر تشغيل قدها</h1>
        <p style={{ color: '#cbd5e1', lineHeight: 1.8 }}>هذه ليست شاشة سوداء صامتة. إعدادات بيئة التشغيل غير مكتملة أو حدث خطأ أثناء تحميل التطبيق.</p>
        <pre data-testid="boot-error" style={{ whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left', padding: '14px', borderRadius: '12px', background: '#080b12', color: '#fda4af', fontSize: '12px' }}>{reason}</pre>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: 0 }}>build: {BUILD_ID}</p>
      </section>
    </main>
  );
}

function renderApp(App: React.ComponentType) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

async function bootstrap() {
  initTheme();
  initMonitoring();
  initNativeShell();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const missing: string[] = [];
  if (!supabaseUrl || supabaseUrl.includes('placeholder')) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) missing.push('VITE_SUPABASE_ANON_KEY');

  if (import.meta.env.PROD && missing.length > 0) {
    renderApp(() => <BootErrorScreen reason={`Missing production variables: ${missing.join(', ')}`} />);
    return;
  }

  try {
    const { default: App } = await import('./App');
    renderApp(App);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderApp(() => <BootErrorScreen reason={message} />);
  }
}

void bootstrap();
