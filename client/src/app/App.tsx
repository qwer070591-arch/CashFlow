import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { AppLayout } from '../layouts/AppLayout';

const AuthPage = lazy(() => import('../pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage').then((module) => ({ default: module.PlaceholderPage })));
const TransactionsPage = lazy(() => import('../pages/TransactionsPage').then((module) => ({ default: module.TransactionsPage })));
const BudgetPage = lazy(() => import('../pages/BudgetPage').then((module) => ({ default: module.BudgetPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));

export function App() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status">正在載入頁面…</div>}><Routes>
      <Route path="login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
      <Route path="register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="budgets" element={<BudgetPage />} />
        <Route path="insights" element={<PlaceholderPage kind="insights" />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isPending) return <div className="auth-loading" role="status">正在確認登入狀態…</div>;
  if (auth.error instanceof ApiError && auth.error.status === 401) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (auth.isError) return <div className="auth-loading" role="alert">暫時無法確認登入狀態。<button onClick={() => void auth.refetch()}>重試</button></div>;
  return children;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.isPending) return <div className="auth-loading" role="status">正在確認登入狀態…</div>;
  if (auth.data) return <Navigate to="/" replace />;
  return children;
}
