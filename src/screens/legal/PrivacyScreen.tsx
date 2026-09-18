import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ScreenShell } from '../../components/layout/ScreenShell';
import { BRAND } from '../../config/brand';

export function PrivacyScreen() {
  return (
    <ScreenShell>
      <header className="mb-6 flex items-center gap-3">
        <Link to="/home" className="btn-ghost -mr-2 p-2">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-xl font-bold">سياسة الخصوصية</h1>
      </header>

      <article className="prose-invert space-y-4 text-sm leading-7 text-white/75">
        <p className="text-xs text-white/40">آخر تحديث: 13 سبتمبر 2026 · {BRAND.name} ({BRAND.nameEn})</p>

        <section>
          <h2 className="font-display text-base font-bold text-white">1. من نحن</h2>
          <p>
            تطبيق {BRAND.name} («التطبيق») يقدّم ألعاب أسئلة وتحديات ومباريات وغرفاً مباشرة.
            جهة التشغيل: فريق {BRAND.name}. للتواصل: {BRAND.supportEmail}
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">2. البيانات التي نجمعها</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>بيانات الحساب: معرّف المستخدم، اسم العرض، الصورة الرمزية (إن وُجدت).</li>
            <li>بيانات اللعب: نتائج المباريات، النقاط، الإنجازات، السلسلة اليومية.</li>
            <li>بيانات تقنية: نوع الجهاز، إصدار التطبيق، سجلات أعطال مجمّعة.</li>
            <li>بيانات المدفوعات: تتم عبر Google Play؛ لا نخزّن رقم بطاقتك. قد نخزّن رمز شراء/حالة اشتراك للتحقق.</li>
            <li>الإعلانات: قد يستخدم شركاء الإعلان معرّفات إعلانية وفق إعدادات جهازك.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">3. الغرض من المعالجة</h2>
          <p>تشغيل اللعب، منع الغش، تحسين التجربة، الدعم الفني، الأمان، والامتثال للمتطلبات القانونية، وقياس الأداء بشكل مجمّع.</p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">4. المشاركة مع أطراف ثالثة</h2>
          <p>
            قد نستخدم مزوّدي بنية تحتية (مثل قواعد البيانات والاستضافة)، وتحليلات، وإعلانات، وخدمات الدفع عبر المتجر.
            لا نبيع بياناتك الشخصية.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">5. الاحتفاظ والأمان</h2>
          <p>نحتفظ بالبيانات طالما لزم تشغيل الحساب أو الالتزام القانوني. نطبّق ضوابط وصول وطبقة خادم للنتائج والاقتصاد.</p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">6. حقوقك</h2>
          <p>
            يمكنك طلب الاطلاع أو التصحيح أو حذف الحساب عبر {BRAND.supportEmail}.
            يمكنك إدارة أذونات الجهاز (الميكروفون، الإعلانات) من إعدادات نظام التشغيل.
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">7. الأطفال</h2>
          <p>التطبيق موجّه لعامّة الجمهور. إن كنت ولياً وتعتقد أن قاصراً قدّم بيانات، راسلنا لحذفها.</p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-white">8. التعديلات</h2>
          <p>قد نحدّث هذه السياسة؛ تاريخ «آخر تحديث» أعلاه يعكس النسخة السارية داخل التطبيق.</p>
        </section>
      </article>
    </ScreenShell>
  );
}
