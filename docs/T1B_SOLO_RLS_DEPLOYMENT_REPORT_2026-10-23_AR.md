# تقرير دفعة T1b — RLS وتقدم Solo الخادمي

**التاريخ:** 23 أكتوبر 2026
**الفرع:** `main`
**الـcommit المرجعي:** `ce12786fa305828f5c4d0d301c889246b8742a27`

## ما أُغلق برمجيًا

1. أضيف جدول `public.solo_journey_progress` بمفتاح فريد لكل مستخدم/فرع/ورقة، وسياسة قراءة خاصة بالمستخدم.
2. أضيفت الدالة `complete_solo_journey_leaf` بصلاحية `service_role` فقط. الدالة تتحقق من أن المباراة Solo منتهية، وأن المستخدم مشارك فيها، وأن المرحلة مطابقة لبيانات المباراة، وأن الورقة السابقة مكتملة. الإكمال idempotent ولا ينتج صفًا مكررًا.
3. أضيف فعل `solo_progress` إلى Edge Function `match`، وربط إنشاء Solo بمرحلة branch/leaf، ومنع بدء مرحلة مقفلة خادميًا.
4. رُبط إنهاء المباراة بتسجيل ورقة الشجرة بعد التسوية الذرية.
5. قُيدت صلاحيات `profiles`: العميل يكتب فقط `username/display_name/avatar_url`، ولا يستطيع تعديل العملات أو XP أو الانتصارات أو الاشتراكات.
6. مُنعت الكتابة المباشرة من العميل إلى الجداول السلطوية للمباريات والجولات والإجابات والمحفظة والاشتراكات والغرف والطوابير؛ المسار المسموح هو Edge Functions.
7. أضيفت اختبارات regression ثابتة لتقدم Solo وRLS.

## ما تم تطبيقه خارجيًا فعليًا

- **Supabase project:** `jwhrbadnirwjyinplbmn`.
- `supabase db push --include-all` نجح وطبّق:
  - `20261023050000_solo_journey_server_progress.sql`
  - `20261023050001_rls_role_hardening.sql`
- `supabase functions deploy match` نجح.
- الدالة `match` ظهرت في قائمة Supabase بحالة `ACTIVE`، الإصدار `12`، آخر تحديث `2026-10-23 01:53:23 UTC`.
- سجل migrations البعيد يطابق الملفين الجديدين.

## التحقق المحلي

- Deno check لكل وظائف Edge Functions: PASS.
- TypeScript: PASS.
- ESLint: PASS.
- Vitest: **8 ملفات / 21 اختبارًا PASS**.
- Production gates: **22 اختبارًا PASS**.
- `verify-production.mjs`: PASS.
- `verify-content-release.mjs`: PASS — 968 صفًا مدققًا، دون تفعيل جماعي.

## ما لم يُغلق بعد

- لم يُنشأ Staging منفصل ولم تُنفذ مصفوفة حسابات anon/authenticated/host/member/blocked على جهاز خارجي.
- لم تُنفذ اختبارات E2E حقيقية بجهازين، خصوصًا انقطاع الشبكة، الخلفية، LiveKit، الغرف، الدفع، الحظر والحذف.
- لا يوجد AAB موقع أو Internal Testing مثبت حتى الآن.
- Google Play وAdMob وLiveKit وTikTok وبيانات المتجر ما زالت تتطلب إعدادًا وحسابات ومراجعات خارجية.
- لا يجوز إعلان GO عربي عام بناءً على هذه الدفعة وحدها.
