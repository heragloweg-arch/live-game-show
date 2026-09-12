import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function TermsScreen() {
  return (
    <div className="min-h-screen px-5 pb-12 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">شروط الاستخدام</h1>
      </header>
      <div className="space-y-4 text-sm leading-7 text-white/70">
        <p>باستخدام زتونة فإنك توافق على اللعب النزيه وعدم الإساءة للاعبين أو المضيفين.</p>
        <p>المحتوى والأسئلة ملك للتطبيق أو مرخّصة له. يُمنع الغش أو استغلال الثغرات.</p>
        <p>العُملات داخل اللعبة ليست نقداً قابلاً للسحب وليست استثماراً.</p>
        <p className="text-xs text-white/40">مسودة Soft Launch — تُراجع قانونياً قبل الإطلاق العام.</p>
      </div>
    </div>
  );
}
