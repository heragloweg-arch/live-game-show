# بناء APK حقيقي — قدها

هذا المشروع **لا يُنتج APK داخل بيئة Codespace بدون Android SDK**.
البناء النهائي يتم على جهاز المطوّر أو CI فيه:

- JDK 17
- Android SDK 36 / compileSdk 36
- Node 22.22.0

## خطوات APK Debug

```bash
cd live-game-show
npm ci --legacy-peer-deps --no-audit --no-fund
cp .env.example .env   # قيم Supabase الحقيقية
npm run build
npx cap add android    # مرة واحدة إذا لزم
npx cap sync android
cd android
./gradlew assembleDebug
```

المخرجات:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Release محلي

يجب أن يبقى keystore خارج Git. يرفض `android/app/build.gradle` أي release بدون المتغيرات الأربعة التالية:

```bash
export RELEASE_KEYSTORE_PATH=/secure/path/qaddaha-release.jks
export RELEASE_KEYSTORE_PASSWORD='...'
export RELEASE_KEY_ALIAS='...'
export RELEASE_KEY_PASSWORD='...'
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
```

الناتج: `android/app/build/outputs/bundle/release/app-release.aab`.

## Release عبر GitHub Actions

شغّل workflow اليدوي `Qaddaha Android Release` وحدد commit أو tag. يحتاج المستودع الأسرار التالية فقط في GitHub Actions Secrets:

- `ANDROID_KEYSTORE_BASE64`
- `RELEASE_KEYSTORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

حدّد `version_code` متزايداً في كل رفع إلى Google Play؛ الـworkflow يحقنه في Gradle ويرفض القيمة الأقل من 1. يمكن ضبط `version_name` للنسخة الظاهرة للمستخدم.

يُرفع الـAAB مع SHA-256 وcommit المصدر كـworkflow artifact لمدة 14 يوماً، ولا تُحفظ مادة التوقيع داخل المستودع.

## صلاحيات LiveKit
Manifest يتضمن RECORD_AUDIO و INTERNET — اطلب الإذن وقت التشغيل عند فتح الميكروفون.
