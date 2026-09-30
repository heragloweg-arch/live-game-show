import { useEffect, useState } from 'react';
import { shouldShowAds } from '../../services/billing/entitlements';
import { hideBanner, initAds, showAd } from '../../services/ads/adMob';

export function BottomAdBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!shouldShowAds()) {
      void hideBanner();
      return;
    }
    let active = true;
    void initAds().then(async () => {
      if (!active || !shouldShowAds()) return;
      const result = await showAd('home_banner');
      if (active) setVisible(result === 'shown');
    });
    return () => {
      active = false;
      void hideBanner();
    };
  }, []);
  if (!visible) return null;
  return <div className="ad-safe-bottom" aria-label="إعلان"><span>إعلان</span></div>;
}
