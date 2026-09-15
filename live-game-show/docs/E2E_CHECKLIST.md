# قدها — E2E Checklist (المرحلة 0 / A)

بيئة: Staging · حسابان على الأقل · جهاز/متصفحان

## إعداد
- [ ] `supabase db push` ناجح
- [ ] Functions: match, answer, matchmaking, economy, voice, room, scoring
- [ ] Secrets: LIVEKIT_* إن وُجد اختبار صوت
- [ ] `.env` يشير إلى Staging
- [ ] `VITE_ENABLE_LOCAL_DEMO=false`

## Auth / Profile
- [ ] فتح التطبيق ينشئ جلسة (anonymous) وصف `profiles`
- [ ] Profile يعرض wins/xp/coins من DB
- [ ] تعديل الاسم يُحفظ

## Solo (سيرفر)
- [ ] Play → صعوبة → إنشاء مباراة (UUID في الرابط)
- [ ] لا يظهر `solo-demo` في الرابط
- [ ] إجابة صحيحة/خاطئة · نقاط · جولات · نهاية
- [ ] تحديث wins/xp/coins بعد النهاية

## 1v1
- [ ] لاعبان يدخلان Matchmaking
- [ ] تطابق وإنشاء مباراة
- [ ] إكمال جولة واحدة على الأقل من الطرفين

## Host / Room
- [ ] إنشاء غرفة + نسخ كود
- [ ] انضمام بالكود من `/room/join`
- [ ] LiveKit يتصل (إن مضبوط)
- [ ] Start challenge · إجابة · كشف نتائج

## Leaderboard
- [ ] يظهر لاعبون حقيقيون بعد مباريات
- [ ] لا بيانات DEMO ثابتة

## Android (عند التوفر)
- [ ] `npm run build && npx cap sync android`
- [ ] APK Debug يُثبَّت
- [ ] إذن الميكروفون

## نتيجة
تاريخ: ____  ·  المختبر: ____  ·  ناجح / فاشل: ____
