declare module '@capgo/native-purchases' {
  export const NativePurchases: {
    setup?: (opts?: Record<string, unknown>) => Promise<void>;
    getProducts?: (opts: { productIdentifiers: string[] }) => Promise<{ products?: unknown[] }>;
    purchaseProduct?: (opts: {
      productIdentifier: string;
      productType?: string;
    }) => Promise<{
      purchaseToken?: string;
      transactionReceipt?: string;
      receipt?: string;
      token?: string;
      orderId?: string;
      transactionId?: string;
    }>;
    acknowledgePurchase?: (opts: { purchaseToken: string }) => Promise<void>;
  };
  const _default: typeof NativePurchases;
  export default _default;
}
