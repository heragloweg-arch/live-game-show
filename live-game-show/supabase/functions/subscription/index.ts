/**
 * Subscriptions & Billing verification
 * actions: catalog | status | verify_google | activate_dev | cancel
 *
 * Production: verify_google should call Google Play Developer API.
 * activate_dev is only for staging when VITE/ALLOW_DEV_BILLING is set server-side.
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

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

      return json({
        plan: sub?.plan ?? profile?.subscription_plan ?? 'free',
        status: sub?.status ?? 'none',
        subscription: sub,
        expiresAt: sub?.expires_at ?? profile?.subscription_expires_at,
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

      // Store receipt (idempotent)
      await supabase.from('purchase_receipts').upsert(
        {
          user_id: user.id,
          product_id: productId,
          purchase_token: purchaseToken,
          order_id: orderId,
          provider: 'google_play',
          status: 'verified',
          verified_at: new Date().toISOString(),
        },
        { onConflict: 'provider,purchase_token' }
      );

      /**
       * PRODUCTION NOTE:
       * Call Google Play Android Publisher API:
       * purchases.subscriptions.get(packageName, subscriptionId, token)
       * Validate paymentState / expiryTimeMillis before activate.
       * Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in secrets.
       */
      const googleApiKey = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
      if (googleApiKey) {
        // Placeholder for real verification — do not activate blindly in prod without API
        console.log('[subscription] GOOGLE_PLAY_PACKAGE_NAME set — wire full verify here');
      }

      return await activatePlan(supabase, user.id, catalogItem.plan, productId, purchaseToken, 'google_play');
    }

    if (action === 'activate_dev') {
      // Staging only
      if (Deno.env.get('ALLOW_DEV_BILLING') !== 'true') {
        return json({ error: 'Dev billing disabled' }, 403);
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
  provider: string
) {
  const days = PLAN_DAYS[plan] ?? 30;
  const starts = new Date();
  const expires = new Date(starts.getTime() + days * 86400000);

  // End previous active
  await supabase
    .from('user_subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');

  const { data: sub, error } = await supabase
    .from('user_subscriptions')
    .insert({
      user_id: userId,
      plan,
      status: 'active',
      provider,
      provider_token: token,
      product_id: productId,
      starts_at: starts.toISOString(),
      expires_at: expires.toISOString(),
      auto_renew: true,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);

  await supabase
    .from('profiles')
    .update({
      subscription_plan: plan,
      subscription_expires_at: expires.toISOString(),
    })
    .eq('id', userId);

  return json({
    ok: true,
    plan,
    status: 'active',
    expiresAt: expires.toISOString(),
    subscription: sub,
  });
}
