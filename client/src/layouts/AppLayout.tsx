import { ArrowUpRight, ChevronDown, CircleHelp, Landmark, LogOut } from 'lucide-react';
import { Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppIcon, StateIcon } from '../components/AppIcon';
import { navigation } from '../lib/navigation';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/auth';

function NavItems({ compact, onNavigate }: { compact: boolean; onNavigate: () => void }) {
  return navigation.map(({ path, label, icon }) => (
    <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate}
      className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
      aria-label={compact ? label : undefined}>
      <AppIcon icon={icon} size={19} /><span>{label}</span>
    </NavLink>
  ));
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => Boolean(window.matchMedia?.('(max-width: 620px)').matches));
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const page = navigation.find(({ path }) => path === location.pathname)?.label ?? '總覽';
  const closeMobile = () => { if (mobileOpen) menuRef.current?.focus(); setMobileOpen(false); };

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 620px)');
    if (!media) return;
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => { setAccountOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!accountOpen) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === 'Escape') { setAccountOpen(false); accountRef.current?.querySelector<HTMLButtonElement>('.account-trigger')?.focus(); }
      else if (event instanceof MouseEvent && !accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [accountOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLElement>('a')?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMobileOpen(false); menuRef.current?.focus(); }
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('a, button:not(:disabled)') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [mobileOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('登出失敗，請稍後重試。');
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className={`app-shell saas-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' mobile-nav-open' : ''}`}>
    <a href="#main-content" className="skip-link">跳至主要內容</a>
    {mobileOpen && <button type="button" className="mobile-nav-backdrop" aria-label="關閉導覽選單" onClick={closeMobile} />}
    <aside id="primary-sidebar" ref={drawerRef} className="sidebar" aria-label="主要導覽" role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? true : undefined} inert={isMobile && !mobileOpen}>
      <div className="sidebar-brand-row">
        <NavLink to="/" className="brand" aria-label="CashFlow 首頁" onClick={closeMobile}>
          <span className="brand-mark"><AppIcon icon={Landmark} size={22} /></span><span>cashflow<span className="brand-dot">.</span></span>
        </NavLink>
        <button type="button" className="sidebar-collapse" aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'} aria-controls="primary-sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><StateIcon icon={collapsed ? PanelLeftOpen : PanelLeftClose} /></button>
      </div>
      <div className="workspace-select"><span className="workspace-avatar">C</span><span><strong>個人工作台</strong><small>你的財務空間</small></span></div>
      <div className="sidebar-label">工作空間</div>
      <nav className="side-nav" aria-label="工作空間"><NavItems compact={collapsed} onNavigate={closeMobile} /></nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><span className="sidebar-help-icon"><AppIcon icon={CircleHelp} size={18} /></span><strong>需要協助嗎？</strong><p>把每筆收支記清楚，從今天開始。</p><NavLink to="/transactions" onClick={closeMobile}>管理交易 <AppIcon icon={ArrowUpRight} size={15} /></NavLink></div>
        <div className="sidebar-profile"><span className="profile-avatar">{user?.name.slice(0, 1) ?? 'C'}</span><span><strong>{user?.name}</strong><small>個人空間</small></span></div>
        <button type="button" className="sidebar-logout" onClick={() => void handleLogout()} disabled={loggingOut}><AppIcon icon={LogOut} size={17} /><span>{loggingOut ? '登出中…' : '登出'}</span></button>
      </div>
    </aside>
    <div className="content-shell">
      <header className="topbar">
        <div className="topbar-leading"><button ref={menuRef} type="button" className="mobile-menu-button" aria-label={mobileOpen ? '關閉選單' : '開啟選單'} aria-controls="primary-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><StateIcon icon={mobileOpen ? X : Menu} size={22} /></button><div className="breadcrumb"><span>工作空間</span><span className="breadcrumb-separator">/</span><strong>{page}</strong></div></div>
        <div className="topbar-actions" ref={accountRef}><button type="button" className="account-trigger" aria-label="帳號選單" aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => setAccountOpen((value) => !value)}><span className="header-avatar" aria-hidden="true">{user?.name.slice(0, 1) ?? 'C'}</span><span className="account-trigger-name">{user?.name}</span><AppIcon icon={ChevronDown} size={16} /></button>{accountOpen && <div id="account-menu" className="account-menu"><strong>{user?.name}</strong><small>{user?.email}</small><button type="button" onClick={() => void handleLogout()} disabled={loggingOut}><AppIcon icon={LogOut} size={16} />{loggingOut ? '登出中…' : '登出'}</button></div>}</div>
      </header>
      <main id="main-content" className="main-content">{logoutError && <p role="alert" className="auth-error">{logoutError}</p>}<Outlet /></main>
    </div>
  </div>;
}
