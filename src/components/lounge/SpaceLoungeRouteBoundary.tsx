import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SpaceLoungeRouteBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-[#080d19] px-5 text-center text-white" dir="rtl">
          <section className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <h1 className="font-display text-xl font-black">تعذر تحميل استراحة الفضاء</h1>
            <p className="mt-3 text-sm leading-7 text-white/55">بقية اللعبة لم تتأثر. حاول تحديث الصفحة أو ارجع إلى الرئيسية.</p>
            <Link to="/home" className="btn-primary mt-5 inline-flex justify-center px-5 py-3">العودة إلى الرئيسية</Link>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
