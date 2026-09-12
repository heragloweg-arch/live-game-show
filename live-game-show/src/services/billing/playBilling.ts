/**
 * Google Play Billing via @capgo/native-purchases (Capacitor).
 * Flow: getProducts → purchaseProduct → verifyGooglePurchase (Edge) → unlock.
 */

import { Capacitor } from '@capacitor/core';
import {
  verifyGooglePurchase,
  activateDevPlan,
  type PlanId,
} from './subscriptionApi';
import { track } from '../analytics/events';

export interface PurchaseResult {
  ok: boolean;
  message?: string;
  plan?: PlanId;
  expiresAt?: string;
}

const PRODUCT_BY_PLAN: Record<string, string> = {
  plus_monthly: 'qaddaha_plus_monthly',
  plus_yearly: 'qaddaha_plus_yearly',
  host_pro: 'qaddaha_host_pro',
};

const PLAN_BY_PRODUCT: Record<string, PlanId> = {
  qaddaha_plus_monthly: 'plus_monthly',
  qaddaha_plus_yearly: 'plus_yearly',
  qaddaha_host_pro: 'host_pro',
};

async function loadNativePurchases(): Promise<any | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('@capgo/native-purchases');
    return mod.NativePurchases ?? mod.default ?? mod;
  } catch (e) {
    console.warn('[billing] native-purchases not available', e);
    return null;
  }
}

export async function initBilling(): Promise<void> {
  const NP = await loadNativePurchases();
  if (!NP) return;
  try {
    if (typeof NP.setup === 'function') {
      await NP.setup({});
    }
  } catch (e) {
    console.warn('[billing] setup', e);
  }
}

export async function getNativeProducts() {
  const NP = await loadNativePurchases();
  if (!NP?.getProducts) return [];
  const ids = Object.values(PRODUCT_BY_PLAN);
  try {
    const res = await NP.getProducts({ productIdentifiers: ids });
    return res?.products ?? res ?? [];
  } catch {
    return [];
  }
}

export async function purchasePlan(plan: PlanId): Promise<PurchaseResult> {
  if (plan === 'free') return { ok: true, plan: 'free' };

  const productId = PRODUCT_BY_PLAN[plan];
  if (!productId) return { ok: false, message: 'منتج غير معروف' };

  track('ad_impression', { placement: 'billing_purchase_start', plan });

  if (Capacitor.isNativePlatform()) {
    const NP = await loadNativePurchases();
    if (!NP?.purchaseProduct) {
      return {
        ok: false,
        message:
          'إضافة الشراء غير مثبتة. نفّذ: npm i && npx cap sync android ثم أعد بناء APK.',
      };
    }

    try {
      const purchase = await NP.purchaseProduct({
        productIdentifier: productId,
        productType: 'subs',
      });

      const token =
        purchase?.purchaseToken ||
        purchase?.transactionReceipt ||
        purchase?.receipt ||
        purchase?.token;
      const orderId = purchase?.orderId || purchase?.transactionId;

      if (!token) {
        return { ok: false, message: 'لم يُرجع المتجر رمز شراء صالحاً' };
      }

      const verified = await verifyGooglePurchase({
        productId,
        purchaseToken: String(token),
        orderId: orderId ? String(orderId) : undefined,
      });

      try {
        if (NP.acknowledgePurchase && token) {
          await NP.acknowledgePurchase({ purchaseToken: String(token) });
        }
      } catch {
        /* optional */
      }

      return { ok: true, plan: verified.plan, expiresAt: verified.expiresAt };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel/i.test(msg)) return { ok: false, message: 'تم إلغاء الشراء' };
      return { ok: false, message: msg };
    }
  }

  if (import.meta.env.VITE_ALLOW_DEV_BILLING === 'true') {
    try {
      const res = await activateDevPlan(plan);
      return { ok: true, plan: res.plan, expiresAt: res.expiresAt };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    ok: false,
    message:
      'الاشتراك عبر Google Play على تطبيق أندرويد فقط. للتجربة: VITE_ALLOW_DEV_BILLING=true مع ALLOW_DEV_BILLING على السيرفر.',
  };
}

export async function confirmNativePurchase(
  productId: string,
  purchaseToken: string,
  orderId?: string
): Promise<PurchaseResult> {
  try {
    const res = await verifyGooglePurchase({ productId, purchaseToken, orderId });
    return {
      ok: true,
      plan: res.plan ?? PLAN_BY_PRODUCT[productId],
      expiresAt: res.expiresAt,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export { PRODUCT_BY_PLAN, PLAN_BY_PRODUCT };
