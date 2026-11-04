

## الأمر التنفيذي — تحديث 4 نوفمبر 2026

تم إصلاح `scripts/write-build-info.mjs` ليكتب `gitCommit` حقيقيًا من `git rev-parse HEAD` أو متغير CI/Railway موثوق، مع فصل `contentFingerprint` وعدم قبول artifact-only fingerprint. البناء المحلي من commit `86679d4f16a0b94fdc9e8ea0c9052ca5b0a9388e` ناجح، وproduction gates 50/50 ناجحة. تم دفع الإصلاح إلى `main` دون force-push.

M0 التشغيلي ما زال `BLOCKED_EXTERNAL`: Railway `/ready` يعرض `qaddaha-web` وHTTP 200، لكنه ما زال على `3a37be340f6503798299774c38e603bc3d08867a` و`artifact-content`، وهي بصمة غير موجودة في GitHub. لا تُسجل مطابقة Railway حتى يعاد ربط/إعادة نشر الخدمة من `main`.

M1: preflight من أصل Railway ينجح HTTP 200، والطلب غير المصرح به إلى daily يرفض HTTP 401. لا توجد جلسة مستخدم اختبارية لإثبات `submit_slot` و`claim_ad_reward`، لذا يبقيان BLOCKED_EXTERNAL. M3: جرد RLS موثق في `docs/RLS_ADVISOR_INVENTORY_2026-11-04_AR.md`، والحالة `جزئي موثق`. M4: لا تفعيل جماعي؛ 968 صفًا مدققًا لكن لا توجد manifest دفعة بمراجع بشرية وreviewer UUID. M5: build وCapacitor sync ناجحان من commit معروف، ولا أسرار/keystore في Git؛ AAB موقّع وInternal Testing يحتاجان أسرار المالك.

القرار: `NO-GO`. لا E2E رسمي ولا Soft Launch ولا Store Ready قبل إغلاق M0 التشغيلي ثم تنفيذ M2 بأدلة حسابات حقيقية.
