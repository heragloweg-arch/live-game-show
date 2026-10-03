# live-game-show — قدها (Qaddaha)

جذر المستودع الإنتاجي لتطبيق تحديات وأسئلة عربية — سرعة، معرفة، غرف مباشرة، دوري أبطال، واشتراكات.

> مصدر الحقيقة هو هذا الجذر فقط. لا ترفع أرشيفات قديمة متعددة بجانب المشروع، ولا تضع المشروع داخل مجلد `qaddaha-ui` متداخل عند اعتماده كمستودع `live-game-show`.

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

## بوابة الإطلاق

قبل أي شراء حقيقي أو إعلان إنتاجي، راجع `docs/FINAL_LAUNCH_GATE_AR.md` وشغّل:

```bash
LAUNCH_GATE=strict npm run verify:launch-config
```

هذه البوابة ترفض Dev Billing وعمليات Play غير الموثقة، وتتحقق من أسرار Google Play وAdMob الإنتاجية.
