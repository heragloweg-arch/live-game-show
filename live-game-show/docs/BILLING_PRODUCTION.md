# مسار الاشتراكات الإنتاجي — قدها

## ما هو مكتمل في الكود
1. كتالوج `subscription_catalog` (plus_monthly / plus_yearly / host_pro)
2. شاشة الاشتراك + شراء عبر `@capgo/native-purchases`
3. Edge `subscription`:
   - `catalog` / `status` / `verify_google` / `restore` / `cancel` / `activate_dev`
4. **التحقق الحقيقي** من Google Play Developer API عبر `_shared/googlePlay.ts`
5. استعادة المشتريات `restore`

## ما تحتاجه أنت فقط (حساب المطوّر)
1. Play Console → التطبيق `com.qaddaha.challenges`
2. إنشاء اشتراكات:
   - `qaddaha_plus_monthly`
   - `qaddaha_plus_yearly`
   - `qaddaha_host_pro`
3. Service Account بصلاحية Android Publisher
4. أسرار Supabase:
```bash
npx supabase secrets set \
  GOOGLE_PLAY_PACKAGE_NAME=com.qaddaha.challenges \
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```
5. **لا** تضبط `ALLOW_UNVERIFIED_PLAY_PURCHASES` في الإنتاج

## التدفق
Play Billing → purchaseToken → Edge verify_google → Android Publisher API → activatePlan → profiles.subscription_plan
