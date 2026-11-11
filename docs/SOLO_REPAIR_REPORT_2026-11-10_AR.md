# تقرير إصلاح رحلة Solo — 10 نوفمبر 2026

## الحكم الحالي

تم إغلاق عدة عيوب P0/P1 في دورة Solo والانتقال بين الجولات. البوابات المحلية ناجحة، لكن لا يجوز إعلان جاهزية تشغيلية نهائية قبل اختبار حساب حقيقي على بيئة Supabase/Staging وجهاز Android.

## الإصلاحات المنفذة

### 1. منع مضاعفة النقاط

كان `submit_answer_atomic` يضيف النقاط داخل المعاملة الذرية، ثم كانت Edge Function `answer` تضيف النقاط مرة أخرى عبر تحديث مباشر لـ`match_participants`. أزيل التحديث الثاني، وأصبح مصدر النقاط الوحيد هو RPC الذري.

كما أزيل تحديث حالة المباراة غير الذري بعد الإجابة، لأنه كان قادراً على الكتابة فوق حالة انتقال أحدث مثل `ROUND_STARTING` أو `MATCH_FINISHED`.

### 2. منع إنهاء المباراة قبل اكتمالها

أصبحت `finishMatch` ترفض التسوية ما لم تكن المباراة في `MATCH_FINISHED` أو `FINAL_RESULT`. إغلاق الجولة الأخيرة يجب أن يحدث أولاً عبر `advance_match_round` الذري.

### 3. توحيد عقد ورقة Solo

العقد الفعلي لرحلة الشجرة هو:

- 48 ورقة: 6 أغصان × 8 أوراق.
- 3 أسئلة في كل ورقة.
- فتح الورقة التالية بعد إجابتين صحيحتين.
- اختيار الأسئلة، الصعوبة، الإغلاق، والتقدم من الخادم.

تم تحديث `verify-solo-progression.mjs` من عقد قديم يختبر 5 جولات إلى العقد الحالي ذي 3 أسئلة، مع الحفاظ على تدرج الصعوبة دون regression.

### 4. تقدم الورقة من الخادم

أضيفت إلى `MatchState` حقول اختيارية مشتقة خادمياً:

- `soloCorrectCount`
- `soloRequiredCorrect`
- `soloLeafQuestions`

وأصبحت واجهة المباراة تعرض عداد الإجابات الصحيحة من `answer_submissions` الخادمية، مع تحديث فوري مؤقت بعد وصول نتيجة الإجابة. عند إعادة الاتصال أو إعادة تحميل الشاشة يعود المصدر إلى العدد الخادمي، لا إلى حالة الجهاز.

### 5. اختبارات انحدار جديدة

أضيفت اختبارات تثبت أن:

- ملكية النقاط تبقى داخل `submit_answer_atomic`.
- لا يوجد تحديث مباشر مكرر للنقاط من Edge Function.
- لا توجد كتابة `ANSWER_SUBMITTED` غير ذرية من مسار الإجابة.
- لا يمكن تسوية مباراة قيد اللعب من خلال `finish`.

## نتائج الفحص المحلي

نجحت بالكامل:

- `npm run typecheck`
- `npm run lint`
- `npm test`: 8 ملفات، 21 اختباراً ناجحاً
- `npm run test:production-gates`: 50 بوابة ناجحة
- `npm run verify:solo-progression`
- `npm run build`
- `git diff --check`

## القيود المتبقية قبل تقييم 9/10

1. لم يتم تنفيذ اختبار حي بحسابين/حساب Staging من خلال Supabase في هذه الجلسة؛ طلب REST أعاد `401 Invalid API key`، لذلك يلزم تصحيح سر الاتصال أو تزويد البيئة بالـproject credentials الصحيحة.
2. يلزم اختبار فعلي من السؤال الأول إلى الثالث مع حفظ `match_id` و`request_id` لكل إجابة.
3. يلزم اختبار الضغط المتزامن على `next_round` وإعادة الإرسال بعد انقطاع الشبكة.
4. يلزم تشغيل Supabase migrations على Staging والتحقق من آخر RPC فعلياً، خصوصاً `create_solo_match_atomic` و`atomic_start_round` و`advance_match_round`.
5. يلزم بناء AAB موقّع واختبار Android حقيقي قبل إعلان Google Play Ready.

## الملفات المعدلة

- `supabase/functions/answer/index.ts`
- `supabase/functions/match/index.ts`
- `src/types/index.ts`
- `src/screens/match/MatchScreen.tsx`
- `scripts/verify-solo-progression.mjs`
- `scripts/atomic-round-advance.test.mjs`
