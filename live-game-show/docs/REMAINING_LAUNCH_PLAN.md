# قدها — الخطوات المتبقية بدقة (بعد P0 + Content + CI)

## أ) تم في الكود (لا تنتظره)
- [x] P0 أمان (profiles / answers / settle / tournament admin / metrics admin)
- [x] Couples vs AI
- [x] LetterPool UI
- [x] Content rebalance Speed/Words/Mystery + weight
- [x] targetSdk 36
- [x] ESLint + package-lock
- [x] Privacy / Terms نص نهائي داخل التطبيق
- [x] Billing verify + restore (ينقص حساب المطوّر فقط)
- [x] AdMob bridge (ينقص وحدات Console فقط)

## ب) حسابات Console (خارج الكود — إلزامي قبل إيراد)
### Google Play
1. إنشاء تطبيق `com.qaddaha.challenges`
2. اشتراكات: `qaddaha_plus_monthly` / `qaddaha_plus_yearly` / `qaddaha_host_pro`
3. Service Account → Android Publisher
4. Secrets:
   - `GOOGLE_PLAY_PACKAGE_NAME`
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
5. اختبار شراء تجريبي + Restore على جهاز

### AdMob
1. إنشاء تطبيق Android
2. وحدات: Banner / Interstitial / Rewarded
3. `.env` إنتاج:
   - `VITE_ADS_ENABLED=true`
   - `VITE_ADMOB_TEST=false`
   - `VITE_ADMOB_*_ID=...`

### Supabase / LiveKit / Analytics
1. `db push` حتى migration 000019
2. Deploy كل Functions
3. Secrets: LiveKit + `TOURNAMENT_ADMIN_IDS` + `METRICS_ADMIN_IDS`
4. PostHog: `VITE_ANALYTICS_ENABLED=true` + Key

## ج) تشغيل قبل Soft Launch
| الترتيب | الخطوة | معيار النجاح |
|---------|--------|----------------|
| 1 | db push + functions deploy | لا أخطاء |
| 2 | E2E ويب Solo + 1v1 | إكمال مباراة + مكافأة سيرفر |
| 3 | محاولة غش coins عبر REST | مرفوض |
| 4 | إجابة مزدوجة لنفس الجولة | مرفوض |
| 5 | APK debug | يتصل بـ Supabase |
| 6 | LiveKit غرفة | صوت مضيف |
| 7 | AdMob test ad | ظهور مرة |
| 8 | Billing test track | تفعيل خطة |
| 9 | Content عينة 100 سؤال | موافقة محرر |
| 10 | Beta 50 لاعب | أسبوع بدون P0 regressions |

## د) قبل الإطلاق العام على المتجر
1. keystore.properties + `bundleRelease` AAB
2. Data Safety في Play Console مطابق Privacy
3. لقطات متجر + فيديو قصير
4. Crashlytics أو Sentry
5. إيقاف `ALLOW_UNVERIFIED_PLAY_PURCHASES` و `VITE_ENABLE_LOCAL_DEMO`
6. Soft launch دول: SA + EG
7. مراقبة D1 / إكمال مباراة أسبوعين ثم توسيع

## هـ) غير مطلوب الآن (بعد ثبات Core)
- Teams 5v5
- Creator Mode / TikTok عميق
- Light theme (اختياري)
- Round-robin tournament alternate mode
