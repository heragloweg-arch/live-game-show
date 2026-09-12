/**
 * Capacitor native bootstrap — status bar, back button, keyboard.
 * Safe no-op on web.
 */

import { Capacitor } from '@capacitor/core';
import { initBilling } from '../services/billing/playBilling';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): string {
  return Capacitor.getPlatform();
}

export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await initBilling();
  } catch {
    /* billing optional until Play products configured */
  }


  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B0F1A' });
  } catch {
    /* plugin optional during web dev */
  }

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch {
    /* optional */
  }
}
