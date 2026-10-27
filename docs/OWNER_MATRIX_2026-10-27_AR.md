# مصفوفة المالك التنفيذية — قدها

**آخر تحديث:** 27 أكتوبر 2026  
**مرجع الكود:** `main`  
**آخر commit معروف:** `f3cf52be` قبل دفعة القياس الحالية

## قاعدة الحالة

- **CLOSED_CODE:** أُغلق في الكود والاختبارات المحلية.
- **READY_TO_DEPLOY:** التغيير جاهز، لكنه يحتاج نشر migration/function إلى Staging.
- **BLOCKED_EXTERNAL:** يحتاج حساباً أو جهازاً أو متجراً أو سراً خارج المستودع.
- **EVIDENCE_REQUIRED:** لا يُعلن نجاحاً إلا بدليل request/deployment ID أو سجل جهاز.

| ID | المجال | المالك | الحالة | الدليل/التغيير | الإجراء التالي |
|---|---|---|---|---|---|
| C1 | بنك الأسئلة المعتمد | مالك المنتج + مراجع المحتوى | EVIDENCE_REQUIRED | القاعدة البرمجية لا تعرض إلا `active=true` و`qa_status=approved`، وتستبعد السؤال بلا إجابة مغلقة | تشغيل دفعة الاعتماد service-role لكل سؤال، مع reviewer UUID وملف نتائج؛ لا تفعيل عبر REST client |
| C2 | الأسئلة الدينية | المراجع الديني | EVIDENCE_REQUIRED | بوابة `religious_review_required` قائمة | حفظ reviewer ID وسجل الاعتماد لكل سؤال ديني |
| C3 | الأسئلة الحرة بلا إجابة | الفريق البرمجي | CLOSED_CODE | `challenge_answers` شرط للتفعيل، وDaily RPC يتحقق من الإجابة | إعادة تشغيل content gate بعد تطبيق الاعتماد |
| C4 | Daily | Backend | READY_TO_DEPLOY | Edge Function وRPC يفرضان active/approved؛ completion ذري | نشر `daily` وmigration `20261027000001` إلى Staging، ثم request IDs لثلاثة أيام/حسابات |
| C5 | D1/D7/D14 | Data/Backend | READY_TO_DEPLOY | `metrics.rebuild_day` يحسب cohorts من profiles وretention_opens ويخزن users/rates | تشغيل rebuild يومي على Staging، ثم تحقق من cohort غير فارغ؛ لا تستخدم أرقام localStorage |
| C6 | Session 2 | Product Analytics | READY_TO_DEPLOY | `session2_users/rate` مشتقة من تكرار server retention opens في اليوم | تعريف session product النهائي وتأكيده من لوحة البيانات بعد 7 أيام |
| C7 | Latency | SRE/Backend | READY_TO_DEPLOY | median وp95 response time من `answer_submissions.response_time_ms`، مع event تشخيصي للعميل | نشر metrics ثم مراقبة p50/p95 وP95 حسب mode/region |
| C8 | Rematch | Backend/Product | READY_TO_DEPLOY | `matches.rematch_of` يربط rematch بالمباراة الأصلية، و`rematch_rate` مشتق خادمياً | نشر migration/function، تنفيذ مباراة منتهية ثم rematch وحفظ IDs |
| C9 | Match completion/drop | SRE | READY_TO_DEPLOY | `matches_finished`, `match_abandonments`, `drop_rate` خادمية | تشغيل rebuild يومي والتحقق من status transitions |
| C10 | Quick Match/AI | Backend | CLOSED_CODE / EVIDENCE_REQUIRED | AI fallback بعد الانتظار، مع participant خادمي | اختبار جهازين/شبكة فعلية وحفظ request IDs |
| C11 | Couples | Backend | CLOSED_CODE / EVIDENCE_REQUIRED | الربط والـmatch engine موجودان | اختبار حسابي couple حقيقيين على Staging |
| C12 | Team Tournament | Backend | CLOSED_CODE / EVIDENCE_REQUIRED | حد 5، Round Robin، 3/1/0، prizes idempotent | اختبار فريقين على Staging وحفظ ledger IDs |
| C13 | Host/TikTok | Backend + صاحب الحساب | BLOCKED_EXTERNAL | الكود موجود | ضبط TikTok secrets وredirect/review واختبار trial/coins/heartbeat |
| C14 | Billing/RTDN | صاحب حساب Google Play | BLOCKED_EXTERNAL | عقود التحقق الخادمي موجودة | إنشاء products وservice account وRTDN، ثم اختبار replay/idempotency |
| C15 | AdMob/UMP/SSV | صاحب AdMob + Backend | BLOCKED_EXTERNAL | قفل production يمنع simulation | ضبط IDs وUMP/SSV وحفظ دليل reward مرة واحدة |
| C16 | LiveKit | SRE/صاحب الحساب | BLOCKED_EXTERNAL | voice path موجود | production keys/limits واختبار دخول/حظر/انقطاع |
| C17 | Android AAB | Release owner | BLOCKED_EXTERNAL | workflow signing موجود | تشغيل GitHub Action بأسرار التوقيع ورفع Internal Testing |
| C18 | E2E العشرة | QA/مالك الجهاز | BLOCKED_EXTERNAL | gate صادق يمنع PASS وهمية | تشغيل السيناريوهات على أجهزة فعلية وإرفاق request IDs |
| C19 | Railway `/ready` | DevOps | BLOCKED_EXTERNAL | endpoint وبصمة commit موجودان | ربط الخدمة والتحقق من build commit والـSupabase target |
| C20 | الأسرار | مالك الحساب | BLOCKED_EXTERNAL | لا تُحفظ في Git | تدوير Supabase Management Token الذي سبق مشاركته، ثم تثبيت secrets الجديدة |

## أمر التنفيذ المختصر

1. تطبيق migration `20261027000001` ونشر `metrics` و`daily` إلى Staging.
2. تنفيذ اعتماد المحتوى service-role فقط، مع reviewer IDs وسجل لكل سؤال؛ تفعيل المحتوى ذي الإجابة المغلقة فقط.
3. تشغيل `rebuild_day` لكل يوم متاح وحفظ نتائج D1/D7/D14 وsession2 وlatency وrematch.
4. تنفيذ سيناريوهات rematch وDaily وإعادة الإرسال وانقطاع الشبكة على حسابات Staging.
5. الانتقال إلى AAB/Store/External integrations فقط بعد اجتياز C1–C9 بأدلة تشغيلية.
