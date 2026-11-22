import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BRAND } from '../../config/brand';

export function PrivacyScreen() {
  return (
    <main className="min-h-screen bg-surface-900 px-4 py-6 text-white" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <Link to="/auth" className="btn-ghost mb-5 inline-flex gap-2"><ArrowRight className="h-4 w-4" /> العودة</Link>
        <h1 className="font-display text-2xl font-black">سياسة الخصوصية</h1>
        <p className="mt-2 text-sm text-white/55">آخر تحديث: 22 نوفمبر 2026</p>
        <div className="mt-6 space-y-6 text-sm leading-7 text-white/75">
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
              نشارك الحد الأدنى اللازم لتشغيل هذه الخدمات، ولا نبيع بياناتك الشخصية.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white">5. الاحتفاظ والأمان</h2>
            <p>نحتفظ ببيانات الحساب واللعب طالما يلزم تشغيل الحساب والامتثال والحد من إساءة الاستخدام. يمكنك طلب حذف بيانات الحساب عبر {BRAND.supportEmail}، مع مراعاة السجلات التي يلزم الاحتفاظ بها قانونيًا.</p>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-white">6. حقوقك</h2>
            <p>
              يمكنك طلب الاطلاع أو التصحيح أو حذف بيانات الحساب عبر {BRAND.supportEmail}.
              يمكنك إدارة أذونات الجهاز (الميكروفون، الإعلانات) من إعدادات نظام التشغيل.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
