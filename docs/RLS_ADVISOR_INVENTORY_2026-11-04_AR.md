# جرد RLS من Supabase Advisor — 2026-11-04

**المشروع:** `jwhrbadnirwjyinplbmn`
**المصدر:** Supabase Advisor الحي، 3 نوفمبر 2026.
**الحالة:** جرد وتوثيق؛ لا يُسجل إغلاقًا أمنيًا كاملًا.

كشف Advisor 24 جدولًا عليه RLS بلا policy. لا يجوز إضافة `USING (true)` لمعالجة الرقم آليًا؛ الجداول التالية مصنفة مبدئيًا حسب طبيعة النظام ومسارات الوصول في migrations والـEdge Functions.

| الجدول | التصنيف المبدئي | سبب عدم فتحه للعميل | مسار الوصول المقصود |
|---|---|---|---|
| `ad_reward_claims` | service-only | حالة مكافأة إعلانية حساسة | Edge/SSV + RPC ذرية |
| `ad_reward_pending` | service-only | توثيق إعلان/معاملة قبل التسوية | Edge/SSV |
| `analytics_daily` | service-only | قياس خادمي لا يقبل أرقام العميل | metrics/rebuild_day |
| `challenge_answers` | service-only | كشف الإجابات مسبقًا يفسد اللعب | Edge answer/daily |
| `challenge_choices` | service-only | يجب ألا يكشف is_correct | Edge/قراءة مصفاة |
| `challenge_content_approvals` | service-only | سجل اعتماد ومراجع | service_role فقط |
| `coin_catalog` | service-only حاليًا | كتالوج اقتصاد يُقدّم عبر API | subscription/economy |
| `coin_purchase_receipts` | service-only | إيصالات Play ومنع التلاعب | billing Edge |
| `daily_pack_ad_claims` | service-only | منع claim مكرر واحتساب الإعلانات | daily RPC |
| `host_room_charges` | service-only | فوترة المضيف | host Edge/RPC |
| `host_room_sessions` | service-only | جلسة فوترة ووقت صلاحية | host Edge/RPC |
| `investor_snapshots` | service-only | بيانات داخلية غير لاعب | admin/metrics |
| `lifeline_uses` | service-only | مورد لعب سلطوي ومنع إعادة الاستخدام | answer/room RPC |
| `purchase_receipts` | service-only | إثبات شراء حساس | subscription Edge |
| `rate_limit_buckets` | service-only | عدادات حماية وحظر | account/safety RPC |
| `room_overlay_tokens` | service-only | رموز دخول/عرض حساسة | overlay Edge |
| `security_events` | service-only | سجل أمني لا يقرأه العميل | safety/admin |
| `tiktok_connections` | service-only | OAuth tokens وحالة الربط | TikTok Login Kit |
| `tiktok_oauth_states` | service-only | state ضد CSRF | TikTok Edge |
| `user_blocks` | service-only | لا يجوز كشف قائمة الحظر أو تعديلها مباشرة | safety RPC |
| `user_cohorts` | service-only | شرائح قياس وتجارب | metrics/admin |
| `user_reports` | service-only | بلاغات وبيانات مراجعة | safety/admin |
| `user_subscriptions` | service-only | entitlement مصدره Play/الخادم | subscription Edge |
| `xp_events` | service-only | نقاط مشتقة وسجل اقتصاد | settlement RPC |

## الاستنتاج

الجرد يدعم إبقاء هذه الجداول مغلقة للعميل، لكنه لا يثبت وحده أن كل مسار Edge مضبوط. يلزم في الدفعة التالية اختبار صلاحيات فعلي بأدوار `anon` و`authenticated` و`service_role`، والتأكد من أن كل قراءة لازمة للواجهة تمر عبر وظيفة مصفاة لا تكشف الإجابة أو بيانات الفوترة.

تم إصلاح فجوة مماثلة في خمس دوال بطولة عبر migration `20261103122217_lockdown_team_tournament_rpcs`. أما تحذيرات `SECURITY DEFINER` الأخرى وتحذيرات الفهارس فتظل بنود متابعة، لا يجوز وصفها بأنها مغلقة دون اختبار أثر وصلاحيات.
