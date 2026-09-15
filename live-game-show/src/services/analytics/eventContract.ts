/**
 * Production event contract — stable names for funnels / retention
 */
export const ANALYTICS_EVENTS = {
  install: 'install',
  app_open: 'app_open',
  onboarding_start: 'onboarding_start',
  onboarding_complete: 'onboarding_complete',
  match_start: 'match_start',
  round_start: 'round_start',
  answer_submit: 'answer_submit',
  answer_correct: 'answer_correct',
  answer_wrong: 'answer_wrong',
  match_complete: 'match_complete',
  match_win: 'match_win',
  match_loss: 'match_loss',
  match_draw: 'match_draw',
  daily_start: 'daily_start',
  daily_complete: 'daily_complete',
  invite_created: 'invite_created',
  invite_accepted: 'invite_accepted',
  subscription_view: 'subscription_view',
  subscription_start: 'subscription_start',
  subscription_success: 'subscription_success',
  ad_impression: 'ad_impression',
  reward_claim: 'reward_claim',
  share_result: 'share_result',
  team_queue: 'team_queue',
  host_create: 'host_create',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
