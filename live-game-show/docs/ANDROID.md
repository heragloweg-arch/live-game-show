# زتونة — Capacitor Android Build Guide

## المتطلبات
- Node 20+
- JDK 17
- Android Studio Hedgehog+ / SDK 34
- متغيرات البيئة: `ANDROID_HOME`

## خطوات البناء

```bash
cd live-game-show
npm install
cp .env.example .env   # املأ Supabase

# بناء الويب
npm run build

# إذا لم يكن مجلد android مكتملاً من cap:
npx cap add android   # مرة واحدة فقط إن لزم
npx cap sync android

# فتح Android Studio
npx cap open android

# أو من الطرفية:
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## الصلاحيات
- INTERNET / NETWORK_STATE
- RECORD_AUDIO (LiveKit)
- BLUETOOTH_CONNECT (سماعة)
- VIBRATE (هaptic)

## ملاحظات
- `webDir` = `dist`
- التطبيق Portrait فقط
- StatusBar داكن متوافق مع الثيم
- بعد أي تغيير في الويب: `npm run android:build`
