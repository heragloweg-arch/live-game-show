# Sprint 4–6 — Content QA · AdMob · Analytics

## Content QA (migration 000012)
- عمود `qa_status` / `qa_notes`
- تعطيل أسئلة ملتبسة (طول النيل عالمياً، صياغة أمريكا الجنوبية، MCQ نبوي غير مناسب)
- إزالة تكرار الـprompt
- إضافة حزمة Speed/Movies/Countries/People/Emoji/Words/Mystery عالية الجودة مع إجابات

```bash
npx supabase db push
```

## Analytics
- PostHog HTTP: `VITE_ANALYTICS_ENABLED=true` + `VITE_POSTHOG_KEY`
- أحداث: app_open, match_*, ad_*, screen_view, …
- Session id + first_open

## AdMob
- `src/services/ads/adMob.ts`
- تكرار: 90s بين Interstitial، حد يومي 8/12
- لا إعلانات أثناء الجولة
- على Android: `npm i @capacitor-community/admob` ثم `npx cap sync`
- متغيرات: `VITE_ADS_ENABLED` + وحدات AdMob

لا Pay-to-Win: المكافأة الإعلانية تجميلية/عملات فقط عبر مسار economy لاحقاً.
