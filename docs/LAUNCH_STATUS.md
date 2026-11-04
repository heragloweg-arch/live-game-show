

## إصلاح Railway build-info — 4 نوفمبر 2026

تم دفع commit `40313d8a8caf75f834ad5a33cf5d3dae0a2708b9` إلى `main` لإصلاح فشل Railway: `write-build-info.mjs` يقرأ SHA بالترتيب `RAILWAY_GIT_COMMIT_SHA` ثم `RAILWAY_GIT_COMMIT` ثم `COMMIT_SHA` ثم `GITHUB_SHA` ثم `VITE_GIT_COMMIT` ثم `CI_COMMIT_SHA` ثم Git، و`Dockerfile` يمرر متغيرات Railway كـ`ARG/ENV`. تم اختبار build محليًا مع Git وبدون `.git` باستخدام `RAILWAY_GIT_COMMIT_SHA`، ونجحت typecheck/lint/Vitest 21/21/production gates 50/50.

وقت التوثيق، Railway ما زال يعرض `3a37be340f6503798299774c38e603bc3d08867a` و`artifact-content` من deploy قديم. لذلك M0 التشغيلي ما زال `BLOCKED_EXTERNAL` إلى أن ينفذ مالك Railway Redeploy/Clear Build Cache ويظهر SHA `40313d8a...` أو SHA آخر موجود في `origin/main`.
