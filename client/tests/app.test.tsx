import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { authQueryKey } from '../src/services/auth';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryDefaults(authQueryKey, { staleTime: Infinity });
  client.setQueryData(authQueryKey, { id: 'test-user', name: '測試會員', email: 'test@example.test', preferredCurrency: 'TWD' });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>);
}

describe('CashFlow navigation', () => {
  const nonHealthResponse = { ok: false, status: 503, json: async () => ({ error: { message: '暫時無法載入' } }) };
  it('renders the dashboard and sidebar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderApp();
    expect(await screen.findByRole('heading', { name: /讓每一筆收支/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '工作空間' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '交易紀錄' }).length).toBeGreaterThan(0);
  });

  it('shows a truthful coming-soon state on a future route', async () => {
    renderApp('/insights');
    expect(await screen.findByRole('heading', { name: '財務分析' })).toBeInTheDocument();
    expect(screen.getByText('詳細分析頁面正在規劃。')).toBeInTheDocument();
    expect(screen.getByText(/總覽已提供真實的收支趨勢與分類統計/)).toBeInTheDocument();
  });

  it('redirects unauthenticated dashboard access to login', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: '請先登入。' } }) }));
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: '歡迎回來' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /讓每一筆收支/ })).not.toBeInTheDocument();
  });

  it('shows API failure clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderApp();
    expect(await screen.findByText('API 尚未啟動或無法連線。')).toBeInTheDocument();
  });

  it('shows connected API and database when both calls succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => path.startsWith('/api/health')
      ? { ok: true, json: async () => ({ status: 'ok', service: 'cashflow-api' }) }
      : nonHealthResponse));
    renderApp();
    expect((await screen.findAllByText('運作正常')).length).toBe(2);
  });

  it('updates the database status after a failed connection recovers', async () => {
    let databaseCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith('/db')) {
        databaseCalls += 1;
        return { ok: databaseCalls > 1, status: databaseCalls > 1 ? 200 : 503, json: async () => ({ status: 'ok', service: 'cashflow-db' }) };
      }
      return path.startsWith('/api/health')
        ? { ok: true, status: 200, json: async () => ({ status: 'ok', service: 'cashflow-api' }) }
        : nonHealthResponse;
    }));
    renderApp();
    expect(await screen.findByText('資料庫尚未連線；其他工作空間功能仍可預覽。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重新檢查/ }));
    await waitFor(() => expect(screen.getAllByText('運作正常')).toHaveLength(2));
  });
});
