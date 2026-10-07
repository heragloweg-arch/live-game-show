import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Chrome, Eye, EyeOff, LockKeyhole, Mail, UserRound, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (/email not confirmed/i.test(message)) return 'أكد بريدك الإلكتروني أولاً ثم حاول تسجيل الدخول.';
  if (/already registered|user already exists/i.test(message)) return 'هذا البريد مسجل بالفعل. استخدم تسجيل الدخول.';
  if (/password/i.test(message) && /6|short|characters/i.test(message)) return 'كلمة المرور يجب ألا تقل عن 6 أحرف.';
  return message || 'تعذر إكمال العملية. حاول مرة أخرى.';
}

export function AuthScreen() {
  const navigate = useNavigate();
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!email.trim() || !email.includes('@')) throw new Error('اكتب بريداً إلكترونياً صحيحاً.');
      if (password.length < 6) throw new Error('كلمة المرور يجب ألا تقل عن 6 أحرف.');
      if (mode === 'signup') {
        const result = await signUpWithPassword(email, password, displayName);
        if (result.needsEmailConfirmation) {
          setMessage('تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم ارجع لتسجيل الدخول.');
          setMode('signin');
          return;
        }
      } else {
        await signInWithPassword(email, password);
      }
      navigate('/home', { replace: true });
    } catch (err) {
      setError(readableAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(readableAuthError(err));
      setBusy(false);
    }
  };

  return (
    <main className="auth-page" dir="rtl">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><img src="/images/logo-qaddaha.png" alt="قدها" /></div>
          <div><span className="eyebrow">استوديو المسابقة</span><strong>قدها</strong></div>
        </div>
        <div className="auth-heading">
          <span className="auth-kicker"><Sparkles size={14} /> حسابك يحفظ رحلتك</span>
          <h1>{mode === 'signin' ? 'ارجع للمنافسة' : 'أنشئ حسابك في قدها'}</h1>
          <p>{mode === 'signin' ? 'احفظ تقدمك وسلسلتك ونتائجك على كل أجهزتك.' : 'ابدأ مجاناً، واحفظ مستواك ومبارياتك ومكافآتك.'}</p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => { setMode('signin'); setError(''); }}>تسجيل الدخول</button>
          <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setError(''); }}>حساب جديد</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && <label><span>اسم العرض</span><div className="auth-input"><UserRound size={18} /><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="اسمك في المنافسة" maxLength={32} /></div></label>}
          <label><span>البريد الإلكتروني</span><div className="auth-input"><Mail size={18} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" dir="ltr" required /></div></label>
          <label><span>كلمة المرور</span><div className="auth-input"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6 أحرف على الأقل" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} dir="ltr" required /><button type="button" className="auth-reveal" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {error && <p className="auth-alert auth-alert-error" role="alert">{error}</p>}
          {message && <p className="auth-alert auth-alert-success" role="status">{message}</p>}
          <button className="btn-primary auth-submit" disabled={busy}>{busy ? 'جاري التحضير...' : mode === 'signin' ? 'دخول آمن' : 'إنشاء الحساب'}</button>
        </form>
        <div className="auth-divider"><span>أو</span></div>
        <button type="button" className="btn-secondary auth-google" onClick={() => void google()} disabled={busy}><Chrome size={18} /> المتابعة بحساب Google</button>
        <button type="button" className="auth-back" onClick={() => navigate('/')}><ArrowRight size={16} /> العودة</button>
      </motion.section>
    </main>
  );
}
