# نشر قدها على Railway — إصلاح فشل البناء

## 1) Root Directory (مهم جداً)

إذا مستودع GitHub هو **نفس** مشروع التطبيق (اسمه `live-game-show` وفيه `package.json` في الجذر):

→ اترك **Root Directory فارغاً**  
→ لا تكتب `/live-game-show`

اكتب `live-game-show` فقط إذا المستودع أب ويحتوي مجلداً داخلياً بهذا الاسم.

من صورتك: Upstream = `heragloweg-arch/live-...`  
الأغلب أن الجذر هو المشروع نفسه → **امسح** حقل Root Directory.

## 2) Variables (وقت البناء)
أضف في Railway → Variables:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_NAME=قدها
VITE_ENABLE_LOCAL_DEMO=false
VITE_ALLOW_DEV_BILLING=false
```
بدونها البناء ينجح لكن التطبيق لن يتصل بـ Supabase.

## 3) بعد دفع الملفات المحدّثة
- `railway.json` يستخدم `npm install` (وليس `npm ci`)
- `build` = `vite build` فقط
- أعد Deploy

## 4) إذا استمر الفشل
افتح **Build logs** وابحث عن:
- `ENOENT package-lock` → تم تجنبه بـ npm install
- `Could not resolve` → تأكد أن Root Directory صحيح
- `tsc` errors → تم إزالة tsc من مسار البناء على Railway
