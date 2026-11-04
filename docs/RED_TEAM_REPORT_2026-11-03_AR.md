

## إصلاح Railway build الفاشل — 4 نوفمبر 2026

سبب الفشل كان صحيحًا: Railway لم يمرر SHA ولم يكن `.git` موجودًا في بيئة البناء. أُصلح ذلك في commit `40313d8a8caf75f834ad5a33cf5d3dae0a2708b9`: مصادر SHA مرتبة من متغيرات Railway/CI المطلوبة، وDockerfile يحتوي `ARG/ENV` لـ`RAILWAY_GIT_COMMIT_SHA` و`RAILWAY_GIT_COMMIT`. محاكاة بيئة بلا `.git` نجحت مع SHA env، كما نجح البناء المحلي وproduction lock وproduction gates 50/50 وVitest 21/21.

لا يزال Railway حيًا على artifact القديم `3a37be...` لأن Redeploy لم يحدث بعد أو لم يصل إلى الخدمة. لم أسجل M0 كـDone؛ يلزم Redeploy/Clear Build Cache من لوحة Railway أو تفعيل Build Variable الصحيح، ثم إثبات `/ready` و`/build-info.json` بـ`gitCommit` موجود على `origin/main` و`fingerprintSource=git-commit`.
