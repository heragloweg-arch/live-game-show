import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function PrivacyScreen() {
  return (
    <div className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">سياسة الخصوصية</h1>
      </header>
      <div className="prose prose-invert max-w-none space-y-4 text-sm leading-7 text-white/70">
        <p>
          تجمع زتونة بيانات الحساب (معرّف الجلسة، الاسم المعروض، إحصائيات اللعب،
          رصيد العملات) لتشغيل المباريات والغرف والمتصدرين.
        </p>
        <p>
          لا نبيع بياناتك الشخصية. قد نستخدم مزوّدي بنية تحتية (مثل Supabase وLiveKit)
          لمعالجة البيانات وفق عقود معالجة.
        </p>
        <p>
          يمكنك طلب حذف الحساب عبر الدعم. سنحدّث هذه السياسة مع إطلاق المتجر.
        </p>
        <p className="text-xs text-white/40">آخر تحديث: سبتمبر 2026 · مسودة Soft Launch</p>
      </div>
    </div>
  );
}
