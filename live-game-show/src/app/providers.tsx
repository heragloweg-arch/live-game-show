import { initTheme } from '../store/themeStore';
import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useConfigStore } from '../store/configStore';
import { ToastViewport } from '../components/ui/ToastViewport';

interface Props {
  children: ReactNode;
}

/**
 * Global providers: auth bootstrap, config fetch, theme.
 * Keeps the tree clean and production-ready.
 */
export function AppProviders({ children }: Props) {
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);
  const fetchConfig = useConfigStore((s) => s.fetchConfig);

  useEffect(() => {
    initTheme();
    bootstrapAuth();
    fetchConfig();
  }, [bootstrapAuth, fetchConfig]);

  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
