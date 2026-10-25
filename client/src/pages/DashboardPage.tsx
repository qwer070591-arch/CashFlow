import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ChartNoAxesCombined, Database, Layers3, Plus, Server, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AppIcon } from '../components/AppIcon';
import { CategoryChart, TrendChart } from '../components/AnalyticsCharts';
import { StatusBadge } from '../components/StatusBadge';
import { useHealth } from '../hooks/useHealth';
import { currentMonthRange, formatMoney, recentMonthsRange } from '../lib/money';
import { analyticsKey, getCategoryTotals, getRecentTransactions, getSummary, getTrends, transactionsKey } from '../services/finance';
import { budgetsKey, getBudgetSummary } from '../services/budgets';
import { BudgetProgress } from '../components/BudgetProgress';

export function DashboardPage() {
  const { api, database } = useHealth();
  const month = currentMonthRange();
  const trendRange = recentMonthsRange();
  const summary = useQuery({ queryKey: [...analyticsKey, 'summary', month], queryFn: () => getSummary(month) });
  const trends = useQuery({ queryKey: [...analyticsKey, 'trends', trendRange], queryFn: () => getTrends(trendRange) });
  const categories = useQuery({ queryKey: [...analyticsKey, 'categories', month], queryFn: () => getCategoryTotals(month) });
  const recent = useQuery({ queryKey: [...transactionsKey, 'recent'], queryFn: getRecentTransactions });
  const budget = useQuery({ queryKey: [...budgetsKey, 'summary', month.startDate.slice(0, 7)], queryFn: () => getBudgetSummary(month.startDate.slice(0, 7)) });
  const rows = recent.data?.items ?? [];
  const apiStatus = api.isPending ? 'loading' : api.isSuccess ? 'ready' : 'error';
  const dbStatus = database.isPending ? 'loading' : database.isSuccess ? 'ready' : 'error';
  const displayDate = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const kpis = [
    { label: '本月收入', value: summary.data ? `NT$ ${formatMoney(summary.data.income)}` : '—', icon: ArrowDownRight, tone: 'income' },
    { label: '本月支出', value: summary.data ? `NT$ ${formatMoney(summary.data.expense)}` : '—', icon: ArrowUpRight, tone: 'expense' },
    { label: '本月淨結餘', value: summary.data ? `NT$ ${formatMoney(summary.data.balance)}` : '—', icon: Wallet, tone: 'balance' },
    { label: '本月交易', value: summary.data ? `${summary.data.transactionCount} 筆` : '—', icon: Layers3, tone: 'count' },
  ];

  return <div className="dashboard saas-dashboard page-enter">
    <div className="page-heading"><div><div className="eyebrow">財務總覽 / OVERVIEW</div><h1>讓每一筆收支，<br className="mobile-break" />都更有方向。</h1><p>本月財務數字依帳戶的全部交易計算。</p></div><span className="heading-date"><AppIcon icon={CalendarDays} size={16} />{displayDate}</span></div>

    <section aria-labelledby="overview-title"><div className="analytics-section-intro"><h2 id="overview-title">本月財務概況</h2><span>{month.startDate} — {month.endDate}</span></div>
      {summary.isError && <div role="alert" className="analytics-error">財務概況暫時無法載入。<button type="button" onClick={() => void summary.refetch()}>重新載入</button></div>}
      <div className="dashboard-kpis">{kpis.map(({ label, value, icon, tone }) => <article className="dashboard-kpi" key={label}><span className="dashboard-kpi-label">{label}</span><div className="dashboard-kpi-value dashboard-money" aria-live="polite">{summary.isPending ? <span className="kpi-skeleton" /> : value}</div><p>完整月份 · 真實交易</p><span className={`dashboard-kpi-icon ${tone}`}><AppIcon icon={icon} size={20} /></span></article>)}</div>
    </section>

    <div className="analytics-grid">
      <section className="dashboard-section" aria-labelledby="trends-title"><div className="dashboard-section-head"><div><span className="section-overline">CASH FLOW</span><h2 id="trends-title">收入與支出趨勢</h2></div><span className="analytics-period">最近 6 個月</span></div>
        {trends.isPending ? <div className="dashboard-skeleton" role="status" aria-label="載入趨勢圖"><span /><span /><span /></div> : trends.isError ? <div role="alert" className="analytics-error">趨勢資料載入失敗。<button type="button" onClick={() => void trends.refetch()}>重試</button></div> : <TrendChart points={trends.data.points} />}
      </section>
      <section className="dashboard-section" aria-labelledby="categories-chart-title"><div className="dashboard-section-head"><div><span className="section-overline">SPENDING</span><h2 id="categories-chart-title">本月支出分類</h2></div></div>
        {categories.isPending ? <div className="dashboard-skeleton" role="status" aria-label="載入支出分類圖"><span /><span /></div> : categories.isError ? <div role="alert" className="analytics-error">分類資料載入失敗。<button type="button" onClick={() => void categories.refetch()}>重試</button></div> : <CategoryChart items={categories.data.items} />}
      </section>
    </div>

    <section className="dashboard-section dashboard-budget" aria-labelledby="dashboard-budget-title"><div className="dashboard-section-head"><div><span className="section-overline">MONTHLY BUDGET</span><h2 id="dashboard-budget-title">本月預算</h2></div><Link to="/budgets" className="dashboard-text-link">管理預算 <AppIcon icon={ArrowRight} size={16} /></Link></div>
      {budget.isPending ? <div className="dashboard-skeleton" role="status" aria-label="載入預算摘要"><span /><span /></div> : budget.isError ? <div role="alert" className="analytics-error">預算摘要無法載入。<button type="button" onClick={() => void budget.refetch()}>重試</button></div> : budget.data.overallBudget ? <div className="dashboard-budget-body"><div className="dashboard-budget-stat"><strong>NT$ {formatMoney(budget.data.overallBudget.remaining)}</strong><span>本月整體預算剩餘</span></div><div className="dashboard-budget-summary"><BudgetProgress budget={budget.data.overallBudget} /><p>接近上限 {budget.data.nearLimitCount} 個 · 已超支 {budget.data.overBudgetCount} 個分類</p></div></div> : <div className="dashboard-budget-body"><p className="dashboard-budget-empty">尚未設定本月整體預算。本月實際支出 NT$ {formatMoney(budget.data.totalExpense)}。</p><Link to="/budgets" className="button button-primary">建立預算</Link></div>}
    </section>

    <div className="dashboard-main-grid dashboard-lower-grid"><section className="dashboard-section" aria-labelledby="recent-title"><div className="dashboard-section-head"><div><span className="section-overline">TRANSACTIONS</span><h2 id="recent-title">近期交易</h2></div><Link to="/transactions" className="dashboard-text-link">查看全部 <AppIcon icon={ArrowRight} size={16} /></Link></div>
      {recent.isPending ? <div className="dashboard-skeleton" role="status" aria-label="載入交易中"><span /><span /><span /></div> : recent.isError ? <div className="dashboard-state" role="alert"><strong>暫時無法載入交易</strong><p>請檢查連線後重試。</p><button type="button" className="button button-primary" onClick={() => void recent.refetch()}>重新載入</button></div> : rows.length === 0 ? <div className="dashboard-state"><span className="dashboard-state-icon"><AppIcon icon={Layers3} size={25} /></span><strong>還沒有交易紀錄</strong><p>建立分類後，新增第一筆收入或支出。</p><Link to="/transactions" className="button button-primary"><AppIcon icon={Plus} size={16} />前往新增交易</Link></div> : <div className="dashboard-recent-list">{rows.map((row) => <div className="dashboard-recent-row" key={row.id}><span className={`dashboard-transaction-icon ${row.type === 'INCOME' ? 'income' : 'expense'}`}><AppIcon icon={row.type === 'INCOME' ? ArrowDownRight : ArrowUpRight} size={19} /></span><div className="dashboard-transaction-detail"><strong>{row.description || row.category.name}</strong><small>{row.category.name} · {row.transactionDate}</small></div><strong className={`dashboard-transaction-amount ${row.type === 'INCOME' ? 'income' : 'expense'}`}>{row.type === 'INCOME' ? '+' : '−'} NT$ {formatMoney(row.amount)}</strong></div>)}</div>}
    </section>
      <div className="dashboard-side-stack"><section className="dashboard-action-card" aria-labelledby="action-title"><span className="section-overline">QUICK START</span><h2 id="action-title">下一筆，從這裡開始。</h2><p>記錄收入與支出，讓日常財務更清楚。</p><Link to="/transactions" className="button button-primary"><AppIcon icon={Plus} size={17} />管理交易</Link></section>
        <section className="dashboard-section dashboard-service" aria-labelledby="system-title"><div className="dashboard-section-head"><div><span className="section-overline">SYSTEM</span><h2 id="system-title">服務狀態</h2></div><button type="button" className="refresh-button" onClick={() => { void api.refetch(); void database.refetch(); }}>重新檢查</button></div><div className="system-row"><span className="system-row-icon"><AppIcon icon={Server} size={18} /></span><span className="system-row-label"><strong>API 服務</strong><small>應用程式介面</small></span><StatusBadge status={apiStatus} labels={{ loading: '檢查中', ready: '運作正常', error: '連線失敗' }} /></div><div className="system-row"><span className="system-row-icon"><AppIcon icon={Database} size={18} /></span><span className="system-row-label"><strong>資料庫</strong><small>PostgreSQL</small></span><StatusBadge status={dbStatus} labels={{ loading: '檢查中', ready: '運作正常', error: '無法連線' }} /></div>{api.isError && <p role="alert" className="status-note">API 尚未啟動或無法連線。</p>}{database.isError && <p role="alert" className="status-note">資料庫尚未連線；其他工作空間功能仍可預覽。</p>}</section>
      </div>
    </div>

    <section className="dashboard-coming" aria-labelledby="coming-title"><div><span className="section-overline">COMING NEXT</span><h2 id="coming-title">規劃中的功能</h2></div><div className="dashboard-coming-items"><Link to="/insights"><AppIcon icon={ChartNoAxesCombined} size={18} />財務分析 <span>即將推出</span></Link></div></section>
  </div>;
}
