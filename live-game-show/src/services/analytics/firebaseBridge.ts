/**
 * Optional Firebase Analytics via gtag if VITE_FIREBASE_MEASUREMENT_ID is set.
 */
export function trackFirebase(name: string, props: Record<string, unknown> = {}) {
  const id = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined;
  if (!id || typeof window === 'undefined') return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  };
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    };
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(s);
    w.gtag('js', new Date());
    w.gtag('config', id, { send_page_view: false });
  }
  w.gtag('event', name, props);
}
