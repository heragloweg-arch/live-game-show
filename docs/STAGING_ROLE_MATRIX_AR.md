# مصفوفة أدوار Staging — قدها

**الغرض:** إغلاق فجوة التحقق الحي دون تحويل اختبارات المصدر إلى ادعاء تشغيل خارجي.

## شروط التشغيل

- مشروع Supabase المقصود محدد ومثبت في سجل النشر.
- نسخة احتياطية موثقة قبل أي migration تغيّرية.
- حسابات اختبار اصطناعية منفصلة عن أي حساب لاعب حقيقي.
- تسجيل `request_id` ووقت UTC واسم الوظيفة والنتيجة فقط، دون JWT أو purchase token أو بيانات شخصية.
- تنفيذ الاختبارات على Staging فقط، مع حذف الحسابات والبيانات الاصطناعية بعد الإغلاق.

## الحسابات المطلوبة

| الدور | الحساب | المطلوب إثباته |
|---|---|---|
| anon | لا يوجد JWT | رفض الوظائف المحمية وعدم قراءة الجداول السلطوية |
| authenticated | لاعب A | إنشاء/قراءة موراده فقط، وعدم تعديل coins/XP/اشتراك مباشرة |
| member | لاعب B داخل غرفة A | قراءة حالة الغرفة المشتركة فقط وإرسال الإجابة ضمن الجولة |
| host | لاعب C | إنشاء غرفة وفق الخطة، heartbeat، وإغلاقها عند انتهاء الصلاحية |
| blocked | لاعب D محظور من A | رفض match/room/token وعدم ظهوره كطرف قابل للدعوة |
| admin | معرف مخصص | الوصول إلى وظائف الإدارة المعلنة فقط وتسجيل audit |
| service_role | وظيفة Edge فقط | تنفيذ mutation السلطوية؛ ممنوع تسريب المفتاح للعميل |

## الاختبارات الإلزامية

| ID | الإجراء | النتيجة المتوقعة | الدليل |
|---|---|---|---|
| R-01 | anon يستدعي match/room/account | `401` أو `403` | status + request_id |
| R-02 | authenticated يحاول تعديل wallet/XP/subscription عبر REST | `401/403` أو رفض RLS | status + عدم تغير الرصيد |
| R-03 | لاعب يطلب غرفة لا ينتمي إليها | `403/404` دون تسريب بيانات | status + response shape |
| R-04 | إجابة خارج الجولة أو بعد الإغلاق | `409/422` ولا ledger event جديد | match/round/request IDs |
| R-05 | إرسال نفس request مرتين | نتيجة idempotent واحدة ولا مكافأة مزدوجة | request_id + ledger count |
| R-06 | blocked يحاول match/room/voice token | رفض متسق في المسارات الثلاثة | request IDs |
| R-07 | account delete بتأكيد صحيح | cleanup ذري ثم حذف الهوية | account request ID + auth result |
| R-08 | account delete بتأكيد خاطئ/مكرر | رفض أو rate-limit دون حذف | request IDs |
| R-09 | admin يراجع بلاغاً | نجاح مع reviewed_by/audit | report ID + request ID |
| R-10 | service_role ينفذ settlement | XP/coins مرة واحدة فقط | match ID + ledger reference |

## تعريف PASS

لا تُسجل المصفوفة `PASS` إلا إذا نُفذت كل الحالات على الحسابات الحقيقية في Staging، وحُفظ سجل منزوعة الأسرار يوضح النجاح والرفض وعدم تغير البيانات السلطوية. فشل حالة واحدة في R-02 أو R-04 أو R-05 أو R-06 أو R-07 يمنع إطلاق T1.

## نموذج السجل

```text
run_id=<uuid>
started_at=<UTC>
project_ref=<non-secret>
commit=<git sha>
case=R-05
actor=authenticated-A
function=match
request_id=<uuid>
status=PASS|FAIL|BLOCKED_EXTERNAL
observed_status=<http status>
ledger_delta=<integer>
notes=<no tokens or PII>
```

**الحالة الحالية:** `BLOCKED_EXTERNAL` — القالب والعقود في المستودع، لكن لم تُقدم حسابات اختبار/backup/سجل تشغيل حي داخل هذه البيئة.
