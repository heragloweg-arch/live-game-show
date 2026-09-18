# Google Play Billing — قدها (إنتاج)

## الحزمة
`@capgo/native-purchases` في package.json

## بناء APK مع الشراء
```bash
cd live-game-show
npm install
npx cap sync android
npm run android:debug
# أو Android Studio → Build APK
```

## المنتجات في Play Console
| productId | النوع |
|-----------|--------|
| qaddaha_plus_monthly | Subscription |
| qaddaha_plus_yearly | Subscription |
| qaddaha_host_pro | Subscription |

## التدفق
1. `initBilling()` عند تشغيل التطبيق الأصلي
2. `purchasePlan(plan)` → NativePurchases.purchaseProduct
3. `verify_google` على Edge Function
4. (موصى) ربط Android Publisher API للتحقق النهائي

## أذونات
`com.android.vending.BILLING` في AndroidManifest.xml

## Staging
`VITE_ALLOW_DEV_BILLING=true` + `ALLOW_DEV_BILLING=true` على السيرفر
