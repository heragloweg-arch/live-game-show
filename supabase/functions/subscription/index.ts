/**
 * Subscriptions & Billing verification
 * actions: catalog | coin_catalog | status | verify_google | verify_google_coin | activate_dev | cancel
 *
 * Production: verify_google should call Google Play Developer API.
 * activate_dev is only for staging when VITE/ALLOW_DEV_BILLING is set server-side.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  verifySubscriptionPurchase,
  acknowledgeSubscriptionPurchase,
  verifyProductPurchase,
  acknowledgeProductPurchase,
} from '../_shared/googlePlay.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const PLAN_DAYS: Record<string, number> = {
  plus_monthly: 30,
  plus_yearly: 365,
  host_pro: 30,
  host_max: 30,
};

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'catalog') {
      const { data, error } = await supabase
        .from('subscription_catalog')
        .select('*')
        .eq('active', true)
        .order('price_micros');
      if (error) return json({ error: error.message }, 500);
      return json({ catalog: data });
    }

    if (action === 'coin_catalog') {
      const { data, error } = await supabase
        .from('coin_catalog')
        .select('pack_id, title, coins, price_micros, currency, google_product_id')
        .eq('active', true)
        .order('price_micros');
      if (error) return json({ error: error.message }, 500);
      return json({ catalog: data ?? [] });
    }

    if (action === 'status') {
      const { data: sub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'grace'])
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_plan, subscription_expires_at, coins')
        .eq('id', user.id)
        .single();

      // Expire if needed
      if (sub?.expires_at && new Date(sub.expires_at) < new Date()) {
        await supabase
          .from('user_subscriptions')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', sub.id);
        await supabase
          .from('profiles')
          .update({ subscription_plan: 'free', subscription_expires_at: null })
          .eq('id', user.id);
        return json({
          plan: 'free',
          status: 'expired',
          subscription: null,
          profile,
        });
      }

      const effectivePlan = sub?.plan ?? profile?.subscription_plan ?? 'free';
      let dailyGrant = null;
      if (['plus_monthly', 'plus_yearly', 'host_pro', 'host_max'].includes(effectivePlan) && (!sub?.expires_at || new Date(sub.expires_at) >= new Date())) {
        // Plus multiplier applies only to the cosmetic daily grant, never to match score or XP.
        const { data: grant } = await supabase.rpc('claim_subscription_daily_atomic', { p_user_id: user.id, p_plan: effectivePlan, p_coins: 50 });
        dailyGrant = grant ?? null;
      }
      return json({
        plan: effectivePlan,
        status: sub?.status ?? 'none',
        subscription: sub,
        expiresAt: sub?.expires_at ?? profile?.subscription_expires_at,
        dailyGrant,
      });
    }

    if (action === 'verify_google') {
      const productId = String(body.productId ?? '');
      const purchaseToken = String(body.purchaseToken ?? '');
      const orderId = body.orderId ? String(body.orderId) : null;

      if (!productId || !purchaseToken) {
        return json({ error: 'productId and purchaseToken required' }, 400);
      }

      // Map product → plan
      const { data: catalogItem } = await supabase
        .from('subscription_catalog')
        .select('*')
        .eq('google_product_id', productId)
        .maybeSingle();

      if (!catalogItem) return json({ error: 'Unknown product' }, 400);

      // Atomically reserve token ownership before calling Google Play. A token cannot be claimed by another account.
      const { data: reservation, error: reservationError } = await supabase.rpc('reserve_google_play_receipt_atomic', {
        p_user_id: user.id,
        p_product_id: productId,
        p_purchase_token: purchaseToken,
        p_order_id: orderId,
      });
      if (reservationError || reservation?.ok !== true) {
        return json({ error: 'Purchase token is already linked or could not be reserved', code: 'PURCHASE_TOKEN_CONFLICT' }, 409);
      }

      const hasGoogleCreds = !!(
        Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') &&
        Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')
      );

      if (hasGoogleCreds) {
        const verified = await verifySubscriptionPurchase(productId, purchaseToken);
        if (!verified.ok || !verified.expiryTimeMillis) {
          await supabase.from('purchase_receipts').update({
            status: 'rejected',
            verified_at: new Date().toISOString(),
          }).eq('provider', 'google_play').eq('purchase_token', purchaseToken).eq('user_id', user.id);
          return json({ error: verified.error || 'Play did not return a valid expiry time', code: 'PLAY_VERIFY_FAILED' }, 402);
        }
        const { error: receiptUpdateError } = await supabase.from('purchase_receipts').update({
          status: 'verified',
          verified_at: new Date().toISOString(),
        }).eq('provider', 'google_play').eq('purchase_token', purchaseToken).eq('user_id', user.id);
        if (receiptUpdateError) return json({ error: 'Verified receipt could not be recorded safely' }, 503);
        const activated = await activatePlan(
          supabase, user.id, catalogItem.plan, productId, purchaseToken, 'google_play',
          new Date(Number(verified.expiryTimeMillis))
        );
        if (activated.status >= 200 && activated.status < 300) {
          const acknowledgement = await acknowledgeSubscriptionPurchase(
            productId, purchaseToken, verified.raw as Record<string, unknown> | undefined
          );
          if (!acknowledgement.ok) {
            console.error('[subscription] purchase acknowledgement pending', acknowledgement.error || 'unknown');
          }
        }
        return activated;
      }

      return json({
        code: 'PLAY_VERIFY_REQUIRED',
      }, 503);
    }

    if (action === 'verify_google_coin') {
      const packId = String(body.packId ?? '');
      const productId = String(body.productId ?? '');
      const purchaseToken = String(body.purchaseToken ?? '');
      const clientOrderId = body.orderId ? String(body.orderId) : null;
      if (!packId || !productId || !purchaseToken) return json({ error: 'packId, productId and purchaseToken required' }, 400);
      const { data: pack } = await supabase
        .from('coin_catalog')
        .select('pack_id, google_product_id, active')
        .eq('pack_id', packId)
        .eq('google_product_id', productId)
        .eq('active', true)
        .maybeSingle();
      if (!pack) return json({ error: 'Unknown coin pack' }, 400);
      const hasGoogleCreds = !!(
        Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') &&
        Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')
      );
      if (!hasGoogleCreds) return json({ error: 'Google Play verification is not configured', code: 'PLAY_VERIFY_REQUIRED' }, 503);
      const verified = await verifyProductPurchase(productId, purchaseToken);
      if (!verified.ok) return json({ error: verified.error ?? 'Play product verification failed', code: 'PLAY_VERIFY_FAILED' }, 402);
      const { data: grant, error: grantError } = await supabase.rpc('grant_coin_purchase_atomic', {
        p_user_id: user.id,
        p_pack_id: packId,
        p_product_id: productId,
        p_purchase_token: purchaseToken,
        p_order_id: verified.orderId ?? clientOrderId,
      });
      if (grantError) {
        if (grantError.message.includes('PURCHASE_TOKEN_CONFLICT')) return json({ error: 'Purchase token is already linked to another account', code: 'PURCHASE_TOKEN_CONFLICT' }, 409);
        return json({ error: 'Coin purchase could not be recorded safely', code: 'COIN_GRANT_FAILED' }, 503);
      }
      const acknowledgement = await acknowledgeProductPurchase(productId, purchaseToken);
      if (!acknowledgement.ok) console.error('[subscription] coin acknowledgement pending', acknowledgement.error || 'unknown');
      return json({
        ok: true,
        already: Boolean(grant?.already),
        coins: Number(grant?.coins ?? 0),
        awarded: Number(grant?.awarded ?? 0),
        packId,
      });
    }

    if (action === 'restore') {
      // Client sends latest purchase tokens after store restore
      const items = Array.isArray(body.purchases) ? body.purchases : [];
      const restored = [];
      for (const item of items) {
        const productId = String(item.productId || '');
        const purchaseToken = String(item.purchaseToken || '');
        if (!productId || !purchaseToken) continue;
        const { data: catalogItem } = await supabase
          .from('subscription_catalog')
          .select('*')
          .eq('google_product_id', productId)
          .maybeSingle();
        if (!catalogItem) continue;
        if (Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') && Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) {
          const { data: reservation, error: reservationError } = await supabase.rpc('reserve_google_play_receipt_atomic', {
            p_user_id: user.id, p_product_id: productId, p_purchase_token: purchaseToken, p_order_id: null,
          });
          if (reservationError || reservation?.ok !== true) continue;
          const verified = await verifySubscriptionPurchase(productId, purchaseToken);
          if (!verified.ok || !verified.expiryTimeMillis) continue;
          const { error: receiptUpdateError } = await supabase.from('purchase_receipts').update({
            status: 'verified', verified_at: new Date().toISOString(),
          }).eq('provider', 'google_play').eq('purchase_token', purchaseToken).eq('user_id', user.id);
          if (receiptUpdateError) continue;
          const activated = await activatePlan(
            supabase, user.id, catalogItem.plan, productId, purchaseToken, 'google_play',
            new Date(Number(verified.expiryTimeMillis))
          );
          if (activated.status >= 200 && activated.status < 300) {
            const acknowledgement = await acknowledgeSubscriptionPurchase(
              productId, purchaseToken, verified.raw as Record<string, unknown> | undefined
            );
            if (!acknowledgement.ok) console.error('[subscription] restore acknowledgement pending', acknowledgement.error || 'unknown');
            restored.push(catalogItem.plan);
          }
        }
      }
      return json({ ok: true, restored });
    }

    if (action === 'activate_dev') {
      // Staging only: fail closed when the environment is missing or ambiguous.
      const environment = Deno.env.get('SUPABASE_ENVIRONMENT') || Deno.env.get('ENVIRONMENT') || '';
      if (environment !== 'staging' || Deno.env.get('ALLOW_DEV_BILLING') !== 'true') {
        return json({ error: 'Dev billing is restricted to an explicitly enabled staging environment' }, 403);
      }
      const plan = body.plan as string;
      if (!PLAN_DAYS[plan]) return json({ error: 'Invalid plan' }, 400);
      return await activatePlan(supabase, user.id, plan, `dev_${plan}`, `dev_${user.id}_${Date.now()}`, 'dev');
    }

    if (action === 'cancel') {
      const { data: sub } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (sub) {
        await supabase
          .from('user_subscriptions')
          .update({ status: 'cancelled', auto_renew: false, updated_at: new Date().toISOString() })
          .eq('id', sub.id);
      }
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[subscription]', err);
    return json({ error: String(err) }, 500);
  }
});

async function activatePlan(
  supabase: any,
  userId: string,
  plan: string,
  productId: string,
  token: string,
  provider: string,
  expiresOverride?: Date
) {
  const starts = new Date();
  const expires = expiresOverride ?? new Date(starts.getTime() + (PLAN_DAYS[plan] ?? 30) * 86400000);
  if (provider === 'google_play' && (!expiresOverride || !Number.isFinite(expiresOverride.getTime()) || expiresOverride.getTime() <= Date.now())) {
    return json({ error: 'Google Play must provide a future verified expiry time' }, 402);
  }
  const { data, error } = await supabase.rpc('activate_subscription_atomic', {
    p_user_id: userId,
    p_plan: plan,
    p_product_id: productId,
    p_purchase_token: token,
    p_provider: provider,
    p_expires_at: expires.toISOString(),
    p_auto_renew: true,
  });
  if (error || !data?.id) {
    console.error('[subscription] atomic activation failed', error?.message ?? 'No subscription returned');
    return json({ error: 'Subscription activation could not be completed safely' }, 503);
  }
  return json({
    ok: true,
    plan: data.plan,
    status: data.status,
    expiresAt: data.expires_at,
    subscription: data,
  });
}
