# اعتماد المحتوى الانتقائي

هذه الدفعة تحتوي 50 سؤالًا غير دينيًا مرشحًا لـ Staging فقط. حالتها `pending_human_content_approval` عمدًا؛ لا تحتوي على اعتماد مزعوم.

بعد أن يراجع مسؤول محتوى مُسمّى كل سؤال، يجب تحديث `reviewerId` وحقول المراجعة لكل صف، ثم تشغيل:

```bash
node scripts/approve-content-batch.mjs content/approval/staging-nonreligious-50.pending.json
```

المتطلبات:

- `SUPABASE_URL` أو `VITE_SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` محفوظ خارج المستودع.
- `factualReviewed=true`.
- `wordingReviewed=true`.
- الفئات الدينية تحتاج `religiousReviewed=true` ولا تستخدم هذه الدفعة لها.

السكربت يمنع الإنتاج مباشرة ويستدعي RPC الخادمي لكل سؤال، ولا يملك العميل صلاحية الاعتماد.
