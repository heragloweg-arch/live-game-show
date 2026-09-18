# Android Wrapper

`gradle-wrapper.jar` is intentionally not committed as a binary blob when missing.
Generate locally:

```bash
cd android
gradle wrapper --gradle-version 8.7
# or open in Android Studio → sync
```

Then:

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug
```
