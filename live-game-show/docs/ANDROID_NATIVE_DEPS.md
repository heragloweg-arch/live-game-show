# اعتمادات Android الإلزامية — قدها

## في package.json (dependencies)
- `@capacitor/android` `@capacitor/core` `@capacitor/app`
- `@capacitor/haptics` `@keyboard` `@status-bar` `@splash-screen` `@preferences`
- `@capacitor-community/admob`
- `@capgo/native-purchases`

## الحزمة الوحيدة
`com.qaddaha.challenges`  
المسار: `android/app/src/main/java/com/qaddaha/challenges/MainActivity.java`  
**لا** تستخدم `com.zatona`.

## بعد كل تغيير ويب
```bash
npm run build && npx cap sync android
```
