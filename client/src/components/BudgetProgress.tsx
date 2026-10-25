import type { Budget, BudgetStatus } from '../services/budgets';
import { formatMoney } from '../lib/money';

const labels: Record<BudgetStatus, string> = {
  NORMAL: '正常', NEAR_LIMIT: '接近上限', AT_LIMIT: '達到上限', OVER_BUDGET: '已超支',
};

export function BudgetProgress({ budget }: { budget: Budget }) {
  const width = Math.max(0, Math.min(100, Number(budget.usagePercent)));
  return <div className={`budget-progress budget-${budget.status.toLowerCase()}`}>
    <div className="budget-progress-head"><span className="budget-status">{labels[budget.status]}</span><strong>{formatMoney(budget.usagePercent)}%</strong></div>
    <div className="budget-track" role="progressbar" aria-label={`${budget.category?.name ?? '整體月預算'}使用率`} aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${budget.usagePercent}%，${labels[budget.status]}`}><span style={{ width: `${width}%` }} /></div>
  </div>;
}
