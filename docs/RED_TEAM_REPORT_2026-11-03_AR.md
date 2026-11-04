

## تحديث تنفيذي 4 نوفمبر 2026

أُصلح سكربت `scripts/write-build-info.mjs` ليكتب `gitCommit` حقيقيًا، ويجعل `fingerprintSource` مساويًا لـ`git-commit`، ويضع `contentFingerprint` في حقل منفصل. البناء المحلي من commit `86679d4f16a0b94fdc9e8ea0c9052ca5b0a9388e` نجح، وproduction gates بقيت 50/50. تم دفع الإصلاح إلى `main` دون force-push بعد دمج commit كان قد وصل إلى origin أثناء التنفيذ.

M1 أعيد فحصه: OPTIONS من أصل Railway ينجح HTTP 200 مع ACAO للنطاق الصحيح، وPOST بلا Authorization ينجح كرفض HTTP 401، مع بقاء ملاحظة Gateway التي تعيد `*` في 401. لا يمكن إثبات `submit_slot` و`claim_ad_reward` بجلسة مستخدم لأن حسابات الاختبار/الجلسة غير متاحة في البيئة الحالية.

M3 أصبح له جرد موثق في `docs/RLS_ADVISOR_INVENTORY_2026-11-04_AR.md`، لكنه يظل «جزئي موثق» بسبب تحذيرات Advisor المتبقية. M4 بقي مقفلاً تشغيليًا: بوابة 968 صفًا ناجحة، ولا توجد موافقة بشرية service-role مع reviewer UUID لتفعيل دفعات؛ لن يتم تفعيل أسئلة اعتباطيًا. M5: Node `v22.23.4`، build و`npx cap sync android` ناجحان، ولا توجد keystore في المستودع؛ `bundleRelease` وInternal Testing محجوبان حتى يوفر المالك keystore خارج Git.

Railway `/ready` ما زال يعرض `3a37be340f6503798299774c38e603bc3d08867a` مع `fingerprintSource: artifact-content`، وهي ليست commit GitHub. لذلك M0 البرمجي مغلق محليًا، لكن M0 التشغيلي وM2 وSoft Launch ما زالت `BLOCKED_EXTERNAL`.
