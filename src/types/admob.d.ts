declare module '@capacitor-community/admob' {
  export const AdMob: {
    initialize: (opts?: Record<string, unknown>) => Promise<void>;
    showBanner: (opts: Record<string, unknown>) => Promise<void>;
    hideBanner: () => Promise<void>;
    prepareInterstitial: (opts: { adId: string }) => Promise<void>;
    showInterstitial: () => Promise<void>;
    prepareRewardVideoAd: (opts: { adId: string }) => Promise<void>;
    showRewardVideoAd: () => Promise<unknown>;
  };
}
