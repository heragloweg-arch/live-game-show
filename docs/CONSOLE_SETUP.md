# إعداد Console — AdMob + Billing فقط

الكود جاهز. هذا ما تفعله في الحسابات:

## Billing
Play Console → Monetize → Subscriptions
- Product IDs يجب أن تطابق الكود حرفياً
- ربط التطبيق بحساب ترخيص للاختبار

Supabase secrets:
```
GOOGLE_PLAY_PACKAGE_NAME=com.qaddaha.challenges
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<json>
```

## AdMob
AdMob → Apps → Add app → Android package `com.qaddaha.challenges`
أنشئ 3 ad units وانسخ المعرفات إلى:
```
VITE_ADMOB_BANNER_ID=
VITE_ADMOB_INTERSTITIAL_ID=
VITE_ADMOB_REWARDED_ID=
VITE_ADS_ENABLED=true
VITE_ADMOB_TEST=false
```
ثم `npm run build && npx cap sync android`
