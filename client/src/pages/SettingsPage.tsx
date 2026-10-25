import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Download, KeyRound, LockKeyhole, UserRound, Wallet } from 'lucide-react';
import { Eye, EyeOff } from 'lucide';
import { AppIcon, StateIcon } from '../components/AppIcon';
import { useAuth } from '../hooks/useAuth';
import { authQueryKey } from '../services/auth';
import { ApiError } from '../services/api';
import { categoriesKey, getCategories } from '../services/finance';
import type { EntryType } from '../services/finance';
import { changePassword, exportTransactions, updateProfile } from '../services/settings';

function message(error: unknown) { return error instanceof ApiError ? error.message : '操作失敗，請稍後重試。'; }
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function monthStart() { return `${today().slice(0, 7)}-01`; }

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return <div className="settings-field"><label htmlFor={id}>{label}</label><span className="settings-password-wrap"><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={autoComplete === 'current-password' ? undefined : 12} maxLength={128} required /><button type="button" aria-label={`${visible ? '隱藏' : '顯示'}${label}`} aria-pressed={visible} onClick={() => setVisible(!visible)}><StateIcon icon={visible ? EyeOff : Eye} size={18} /></button></span></div>;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();
  const categories = useQuery({ queryKey: categoriesKey, queryFn: getCategories });
  const [name, setName] = useState(user?.name ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState<EntryType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  useEffect(() => { if (user) setName(user.name); }, [user?.id, user?.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileBusy) return;
    const clean = name.trim();
    if (!clean || clean.length > 100) { setProfileError('名稱需為 1 至 100 字元。'); return; }
    setProfileBusy(true); setProfileError(''); setProfileNotice('');
    try { const updated = await updateProfile(clean); queryClient.setQueryData(authQueryKey, updated); setName(updated.name); setProfileNotice('顯示名稱已更新。'); }
    catch (error) { setProfileError(message(error)); }
    finally { setProfileBusy(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy) return;
    if (newPassword !== confirmPassword) { setPasswordError('兩次輸入的新密碼不一致。'); return; }
    if (newPassword.length < 12 || newPassword.length > 128) { setPasswordError('新密碼需為 12 至 128 字元。'); return; }
    setPasswordBusy(true); setPasswordError('');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      queryClient.clear();
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (error) { setPasswordError(message(error)); }
    finally { setPasswordBusy(false); }
  }

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exportBusy) return;
    if (startDate > endDate) { setExportError('起始日期不可晚於結束日期。'); return; }
    setExportBusy(true); setExportError(''); setExportNotice('');
    try {
      const { blob, count } = await exportTransactions({ startDate, endDate, ...(type ? { type } : {}), ...(categoryId ? { categoryId } : {}) });
      if (count === 0) { setExportNotice('所選範圍沒有可匯出的交易。'); return; }
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `cashflow-transactions-${startDate}_to_${endDate}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        setExportNotice(`已下載 ${count} 筆交易。`);
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) { setExportError(message(error)); }
    finally { setExportBusy(false); }
  }

  return <div className="settings-page page-enter">
    <div className="settings-heading"><div className="eyebrow"><span className="eyebrow-line" /> 個人財務</div><h1>帳號與資料設定</h1><p>管理個人資訊、帳號安全與交易資料匯出。</p></div>
    <div className="settings-grid">
      <section className="settings-card" aria-labelledby="settings-profile-title"><div className="settings-card-heading"><span className="settings-icon"><AppIcon icon={UserRound} size={20} /></span><div><span className="section-overline">PROFILE</span><h2 id="settings-profile-title">個人資料</h2></div></div>
        <form onSubmit={(event) => void saveProfile(event)}><label className="settings-field">使用者名稱<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} required /></label><div className="settings-field"><span>Email</span><div className="settings-readonly">{user?.email}</div></div><p className="settings-hint">Email 目前不可變更。</p>{profileError && <p role="alert" className="auth-error">{profileError}</p>}{profileNotice && <p role="status" className="auth-success">{profileNotice}</p>}<button className="button button-primary" type="submit" disabled={profileBusy}>{profileBusy ? '儲存中…' : '儲存名稱'}</button></form>
      </section>
      <section className="settings-card" aria-labelledby="settings-security-title"><div className="settings-card-heading"><span className="settings-icon"><AppIcon icon={LockKeyhole} size={20} /></span><div><span className="section-overline">SECURITY</span><h2 id="settings-security-title">帳號安全</h2></div></div>
        <p className="settings-hint">修改密碼後，所有裝置的登入工作階段會結束，請使用新密碼重新登入。</p><form onSubmit={(event) => void savePassword(event)}><PasswordField label="目前密碼" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" /><PasswordField label="新密碼" value={newPassword} onChange={setNewPassword} autoComplete="new-password" /><PasswordField label="確認新密碼" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />{passwordError && <p role="alert" className="auth-error">{passwordError}</p>}<button className="button button-primary" type="submit" disabled={passwordBusy}><AppIcon icon={KeyRound} size={16} />{passwordBusy ? '更新中…' : '更新密碼'}</button></form>
      </section>
      <section className="settings-card" aria-labelledby="settings-currency-title"><div className="settings-card-heading"><span className="settings-icon"><AppIcon icon={Wallet} size={20} /></span><div><span className="section-overline">CURRENCY</span><h2 id="settings-currency-title">記帳設定</h2></div></div><p className="settings-currency">記帳基準貨幣 <strong>新台幣 TWD</strong></p><p className="settings-hint">目前所有金額以 NT$ 表示，不進行匯率換算。多幣別功能將於後續版本提供。</p></section>
      <section className="settings-card" aria-labelledby="settings-export-title"><div className="settings-card-heading"><span className="settings-icon"><AppIcon icon={Download} size={20} /></span><div><span className="section-overline">DATA EXPORT</span><h2 id="settings-export-title">交易資料匯出</h2></div></div><p className="settings-hint">選擇最多 366 天的日期範圍，下載其中所有符合條件的交易（最多 5,000 筆）。</p>
        <form onSubmit={(event) => void download(event)}><div className="settings-export-fields"><label className="settings-field">起始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label className="settings-field">結束日期<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label><label className="settings-field">收支類型<select value={type} onChange={(event) => { setType(event.target.value as EntryType | ''); setCategoryId(''); }}><option value="">全部</option><option value="INCOME">收入</option><option value="EXPENSE">支出</option></select></label><label className="settings-field">分類<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={categories.isPending || categories.isError}><option value="">全部分類</option>{(categories.data ?? []).filter((item) => !type || item.type === type).map((item) => <option key={item.id} value={item.id}>{item.type === 'INCOME' ? '收入' : '支出'} · {item.name}</option>)}</select></label></div>{categories.isError && <p role="alert" className="auth-error">分類暫時無法載入；可先依日期與類型匯出。</p>}{exportError && <p role="alert" className="auth-error">{exportError}</p>}{exportNotice && <p role="status" className="auth-success">{exportNotice}</p>}<div className="settings-export-actions"><button className="button button-primary" type="submit" disabled={exportBusy}><AppIcon icon={Download} size={16} />{exportBusy ? '準備檔案中…' : '匯出 CSV'}</button><span>UTF-8 · Excel 相容 · 交易金額保留兩位小數</span></div></form>
      </section>
    </div>
  </div>;
}
