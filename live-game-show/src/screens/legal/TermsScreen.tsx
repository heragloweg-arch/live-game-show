import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { BRAND } from '../../config/brand';

export function TermsScreen() {
  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">شروط الاستخدام</h1>
      </header>

      <article className="space-y-4 text-sm leading-7 text-white/75">
        <p className="text-xs text-white/40">آخر تحديث: 13 سبتمبر 2026 · {BRAND.name}</p>

        <section>
          <h2 className="font-display text-base font-bold text-white">1. القبول</h2>
          <p>باستخدامك {BRAND.name} فإنك توافق على هذه الشروط وسياسة الخصوصية.</p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">2. الخدمة</h2>
          <p>
            نقدّم مباريات أسئلة، تحديات يومية، غرفاً مباشرة، وميزات اختيارية مدفوعة.
            نحتفظ بحق تعديل أو إيقاف ميزات مع إشعار معقول عند الإمكان.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">3. الحساب والسلوك</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>لا غش، لا استغلال ثغرات، لا إساءة للاعبين أو المضيفين.</li>
            <li>المحتوى الصوتي في الغرف مسؤولية المشاركين؛ يُحظر المحتوى غير القانوني أو المسيء.</li>
            <li>قد نعلّق أو نغلق حسابات تخالف القواعد أو تهدد نزاهة اللعب.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">4. العملات الافتراضية والمشتريات</h2>
          <p>
            العملات والمكافآت داخل التطبيق افتراضية وليس لها قيمة نقدية خارج الخدمة إلا عبر عروض نحددها.
            الاشتراكات والمشتريات تتم عبر Google Play وتخضع لشروط Google.
            لا «ادفع لتربح» يكسر نزاهة المباراة التنافسية.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">5. الملكية الفكرية</h2>
          <p>اسم {BRAND.name} والشعار والواجهة والكود محميان. لا يُنسخ المحتوى دون إذن.</p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">6. إخلاء المسؤولية</h2>
          <p>
            الخدمة «كما هي». لا نضمن عدم الانقطاع. لسنا مسؤولين عن خسائر غير مباشرة ناتجة عن استخدام التطبيق
            في حدود ما يسمح به القانون المعمول به.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">7. القانون والتواصل</h2>
          <p>للاستفسارات: {BRAND.supportEmail}</p>
        </section>
      </article>
    </ScreenShell>
  );
}
