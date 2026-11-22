

## تحقق Railway بعد commit إزالة الساحة — 22 نوفمبر 2026

بعد رفع commit `c3e7543ef90aeb225473db4ad6c28d03744cb354`، أعاد Railway الجديد `/ready` HTTP 200، وأعاد `/build-info.json` بصمة `gitCommit` مطابقة للـcommit نفسه، مع `runtimeConfig=true`. تم انتظار المزامنة حتى ظهرت البصمة الجديدة بدل بصمة `bf5088ec` السابقة.
