# سجل E2E الميداني — قدها

هذا الملف هو سجل التنفيذ، وليس بديلاً عن تشغيل جهازين أو محاكيين على شبكة فعلية. لا يجوز وضع `PASS` اعتماداً على typecheck أو build فقط.

## البيئة المطلوبة

- Android/Capacitor مبني من Node `>=22.22.0`.
- AAB أو APK من commit موثق.
- مشروع Staging معلوم ومطابق للمصدر.
- جهازان أو محاكيان، وشبكة Wi‑Fi ثم شبكة جوال/انقطاع متعمد.
- حسابات اختبار منفصلة، دون بيانات أو رموز شراء حقيقية.
- تسجيل request IDs وmatch IDs وround IDs فقط.

## السيناريوهات

| # | السيناريو | الحالة | دليل التنفيذ | ملاحظات/إصلاح |
|---|---|---|---|---|
| 1 | Solo: الورقة 1 ثم الإكمال وفتح الورقة 2 | BLOCKED_EXTERNAL | — | يحتاج جهاز/حساب Staging؛ تحقق من `difficultyPlan` الخادمي |
| 2 | 1v1 على جهازين ونتيجة عادلة | BLOCKED_EXTERNAL | — | يحتاج جهازين وشبكة |
| 3 | سباق `next_round` وإرسال الإجابة مرتين | BLOCKED_EXTERNAL | — | يجب أن تكون مكافأة/إجابة واحدة |
| 4 | قطع الشبكة ثم عودة التطبيق للخلفية | BLOCKED_EXTERNAL | — | لا إعادة إرسال غير idempotent |
| 5 | غرفة: start → answer → reveal → close → التالي | BLOCKED_EXTERNAL | — | تحقق من heartbeat وRealtime |
| 6 | مضيف trial/coins/heartbeat | BLOCKED_EXTERNAL | — | يحتاج أسرار/خطة تشغيل حية |
| 7 | Overlay/QR إن كان ضمن النطاق | BLOCKED_EXTERNAL | — | تحقق من صلاحية وانتهاء الرابط |
| 8 | حظر ثم محاولة دخول صوت | BLOCKED_EXTERNAL | — | يجب رفض token وإزالة الطرف المحظور فقط |
| 9 | حذف الحساب | BLOCKED_EXTERNAL | — | تحقق من cleanup ثم حذف Auth |
| 10 | Daily وإعادة الإرسال | BLOCKED_EXTERNAL | — | مكافأة واحدة وسجل ذري واحد |

## معيار النجاح لكل سيناريو

- لا يوجد crash أو شاشة عالقة.
- لا توجد إجابة أو مكافأة مضاعفة.
- كل انتقال حالة يأتي من الخادم.
- يستطيع المستخدم العودة من الخلفية أو انقطاع الشبكة دون فساد الجلسة.
- لا يظهر secret أو purchase token في السجل.

## نموذج توثيق

```text
run_id=<uuid>
commit=<git sha>
device_a=<model/os>
device_b=<model/os or none>
network=<wifi|cellular|offline transition>
scenario=<1..10>
request_ids=<comma-separated sanitized IDs>
match_ids=<sanitized IDs>
result=PASS|FAIL|BLOCKED_EXTERNAL
crash_free=yes|no
reward_delta=<integer>
notes=<reproducible details>
```

**الحالة الحالية:** `BLOCKED_EXTERNAL`. بعد توفير الجهازين ونسخة AAB وبيئة Staging، يُملأ هذا الملف دون تعديل تعريفات PASS.

## بوابة القبول المرحلية

يفحص `npm run verify:e2e-log` أن السيناريوهات العشرة موجودة، وأن أي حالة `PASS` تملك دليلاً ميدانياً غير فارغ، وأن أي `FAIL` يمنع المرور. عند بقاء الحالات `BLOCKED_EXTERNAL` ينجح الفحص فقط بوصفه فحص أمانة للتوثيق، ولا يحول الحالة إلى `GO` أو `PASS` تشغيلي.

ترتيب الإغلاق الإلزامي هو: تشغيل مصفوفة الأدوار على Staging، بناء AAB موقع من commit موثق، تنفيذ السيناريوهات على جهازين/شبكتين، إرفاق request IDs وmatch IDs منزوعة الأسرار، ثم تشغيل Internal Testing قبل أي قرار Soft Launch.
