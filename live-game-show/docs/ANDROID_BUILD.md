# بناء APK حقيقي — زتونة

هذا المشروع **لا يُنتج APK داخل بيئة Codespace بدون Android SDK**.
البناء النهائي يتم على جهاز المطوّر أو CI فيه:

- JDK 17
- Android SDK 34
- Node 20

## خطوات APK Debug

```bash
cd live-game-show
npm install
cp .env.example .env   # قيم Supabase الحقيقية
npm run build
npx cap add android    # مرة واحدة إذا لزم
npx cap sync android
cd android
./gradlew assembleDebug
```

المخرجات:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Release

1. أنشئ keystore
2. اضبط `android/app/build.gradle` signingConfigs
3. `./gradlew assembleRelease`

## صلاحيات LiveKit
Manifest يتضمن RECORD_AUDIO و INTERNET — اطلب الإذن وقت التشغيل عند فتح الميكروفون.
