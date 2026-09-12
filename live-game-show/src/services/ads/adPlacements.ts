import { isFeatureEnabled } from '../../config/softLaunch';
import { track } from '../analytics/events';

export type AdPlacement = 'home_banner' | 'post_match_interstitial' | 'rewarded_extra_coins';

export function canShowAd(placement: AdPlacement): boolean {
  if (!isFeatureEnabled('ads')) return false;
  return true;
}

export async function showAd(placement: AdPlacement): Promise<'shown' | 'skipped' | 'disabled'> {
  if (!canShowAd(placement)) return 'disabled';
  track('ad_impression', { placement });
  return 'skipped';
}
