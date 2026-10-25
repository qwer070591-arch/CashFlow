import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { Eye, EyeOff } from 'lucide';
import { AppIcon, StateIcon } from '../components/AppIcon';
import { Link, useLocation, useNavigate } from 'react-router';
import { authQueryKey, login, register } from '../services/auth';
import { ApiError } from '../services/api';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (isRegister && password !== confirmation) {
      setError('兩次輸入的密碼不一致。');
      return;
    }
    if (isRegister && password.length < 12) {
      setError('密碼至少需要 12 個字元。');
      return;
    }
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ name: name.trim(), email: email.trim(), password });
        navigate('/login', { replace: true, state: { email: email.trim(), registered: true } });
      } else {
        const user = await login({ email: email.trim(), password });
        queryClient.setQueryData(authQueryKey, user);
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '操作失敗，請稍後再試。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/login"><span className="brand-mark"><AppIcon icon={Landmark} size={23} /></span><span>cashflow<span className="brand-dot">.</span></span></Link>
        <div className="auth-eyebrow">你的個人財務空間</div>
        <h1 id="auth-title">{isRegister ? '建立帳號' : '歡迎回來'}</h1>
        <p className="auth-intro">{isRegister ? '從這裡開始，整理每一筆收支。' : '登入後繼續使用你的 CashFlow 工作台。'}</p>
        {!isRegister && (location.state as { registered?: boolean } | null)?.registered && <p className="auth-success" role="status">註冊成功，請登入。</p>}
        {!isRegister && (location.state as { passwordChanged?: boolean } | null)?.passwordChanged && <p className="auth-success" role="status">密碼已更新，請使用新密碼重新登入。</p>}
        <form onSubmit={(event) => void submit(event)}>
          {isRegister && <label className="auth-field">姓名<input name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} required /></label>}
          <label className="auth-field">Email<input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={320} required /></label>
          <label className="auth-field">密碼<span className="password-wrap"><input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 12 : undefined} maxLength={128} required /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? '隱藏密碼' : '顯示密碼'} aria-pressed={showPassword}><StateIcon icon={showPassword ? EyeOff : Eye} size={19} /></button></span></label>
          {isRegister && <label className="auth-field">確認密碼<input name="confirmation" type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '處理中…' : isRegister ? '建立帳號' : '登入'}</button>
        </form>
        <p className="auth-switch">{isRegister ? '已經有帳號？' : '還沒有帳號？'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? '前往登入' : '建立帳號'}</Link></p>
      </section>
      <aside className="auth-aside" aria-hidden="true"><div className="auth-aside-art"><span>清楚掌握，<br />每一筆日常。</span><div className="auth-art-card"><span>CashFlow</span><strong>你的財務，一目了然</strong><i /></div></div></aside>
    </main>
  );
}
