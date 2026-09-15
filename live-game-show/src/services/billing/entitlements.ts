import { useAuthStore } from '../../store/authStore';

export type PlanId = 'free' | 'plus_monthly' | 'plus_yearly' | 'host_pro' | string;

function profileFromStore() {
  const state = useAuthStore.getState() as any;
  // authStore holds profile fields on `user`
  return state.user ?? state.profile ?? null;
}

export function getActivePlan(): PlanId {
  const p = profileFromStore();
  if (!p?.subscription_plan) return 'free';
  const exp = p.subscription_expires_at ? new Date(p.subscription_expires_at) : null;
  if (exp && exp.getTime() < Date.now()) return 'free';
  return p.subscription_plan as PlanId;
}

export function isPlusActive(): boolean {
  const plan = getActivePlan();
  return plan === 'plus_monthly' || plan === 'plus_yearly' || plan === 'host_pro';
}

export function isHostProActive(): boolean {
  return getActivePlan() === 'host_pro';
}

export function shouldShowAds(): boolean {
  return !isPlusActive();
}

export function dailyRewardMultiplier(): number {
  return isPlusActive() ? 2 : 1;
}
