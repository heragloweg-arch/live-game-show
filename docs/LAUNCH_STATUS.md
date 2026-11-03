

## تحديث Red Team — 3 نوفمبر 2026

تم تطبيق migration `20261103122217_lockdown_team_tournament_rpcs` على Supabase Staging بعد إثبات حي أن خمس دوال بطولة سلطوية كانت قابلة للتنفيذ من `anon` و`authenticated`. التحقق بعد التطبيق أكد أن EXECUTE لهذه الدوال أصبح لـ`service_role` فقط. بقي `get_public_profiles` بصلاحية قراءة عامة مقصودة ومحدودة الحقول.

Advisor الأمن ما زال يعرض 24 جدولًا RLS بلا policy و6 دوال SECURITY DEFINER في الإنذار، إضافة إلى تحذيرات فهرسة وتهيئة سياسات RLS. لذلك لا تُسجل F3 كإغلاق كامل قبل مراجعة الاستثناءات. كما أن Railway `/ready` يعرض حاليًا artifact ببصمة `3a37be340f6503798299774c38e603bc3d08867a` غير موجودة في GitHub؛ لا توجد مطابقة نشر صالحة لـ`main` حتى تتصلح خدمة Railway.
