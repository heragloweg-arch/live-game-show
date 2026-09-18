# قدها (Qaddaha)

تطبيق تحديات وأسئلة عربية — سرعة، معرفة، غرف مباشرة، دوري أبطال، واشتراكات.

## الهوية
- الاسم: **قدها**
- الشعار: `public/images/logo-qaddaha.png`
- الحزمة: `com.qaddaha.challenges`

## تشغيل
```bash
npm install
cp .env.example .env
npm run dev
```

## Android
```bash
npm run build
npx cap sync android
npm run android:debug
```

## Supabase
```bash
npx supabase db push
npx supabase functions deploy
```
