import { useState } from 'react';
import type { CategoryTotal, TrendPoint } from '../services/finance';
import { formatMoney } from '../lib/money';

const colors = ['#18734e', '#b77932', '#3c709a', '#8770a6', '#a95d68', '#6c8974'];

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.flatMap((point) => [Number(point.income), Number(point.expense)]));
  const hasData = points.some((point) => point.income !== '0.00' || point.expense !== '0.00');
  if (!hasData) return <div className="analytics-empty">這段期間尚無交易，趨勢圖會在新增交易後顯示。</div>;
  const top = 18; const bottom = 206; const height = bottom - top;
  const slot = 550 / points.length;
  return <div className="chart-wrap">
    <svg viewBox="0 0 640 252" role="img" aria-label="每月收入與支出長條圖" className="trend-chart">
      {[0, 1, 2, 3].map((index) => <g key={index}><line x1="64" x2="624" y1={top + (height / 3) * index} y2={top + (height / 3) * index} stroke="#e5ebe7" /><text x="54" y={top + (height / 3) * index + 4} textAnchor="end" className="chart-axis">{new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(max * (1 - index / 3))}</text></g>)}
      {points.map((point, index) => {
        const x = 72 + index * slot + slot / 2;
        const incomeHeight = Number(point.income) / max * height;
        const expenseHeight = Number(point.expense) / max * height;
        return <g key={point.month} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
          <rect x={x - 22} y={bottom - incomeHeight} width="19" height={incomeHeight} rx="4" fill="#18734e" tabIndex={0} onFocus={() => setActive(index)} onBlur={() => setActive(null)}><title>{point.month} 收入 NT$ {formatMoney(point.income)}</title></rect>
          <rect x={x + 3} y={bottom - expenseHeight} width="19" height={expenseHeight} rx="4" fill="#b77932" tabIndex={0} onFocus={() => setActive(index)} onBlur={() => setActive(null)}><title>{point.month} 支出 NT$ {formatMoney(point.expense)}</title></rect>
          <text x={x} y="232" textAnchor="middle" className="chart-axis">{point.month.slice(5)}月</text>
        </g>;
      })}
    </svg>
    <div className="trend-mobile" aria-label="每月收入與支出長條圖">
      {points.map((point, index) => <button type="button" className="trend-mobile-month" key={point.month} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} aria-label={`${point.month}：收入 NT$ ${formatMoney(point.income)}，支出 NT$ ${formatMoney(point.expense)}`}>
        <span className="trend-mobile-bars"><i className="trend-mobile-income" style={{ height: `${Number(point.income) / max * 100}%` }} /><i className="trend-mobile-expense" style={{ height: `${Number(point.expense) / max * 100}%` }} /></span><span>{point.month.slice(5)}月</span>
      </button>)}
    </div>
    <div className="chart-legend"><span><i className="legend-income" />收入</span><span><i className="legend-expense" />支出</span></div>
    <p className="chart-tooltip" role="status">{active === null ? '將滑鼠移至長條或以 Tab 聚焦，即可查看精確金額。' : `${points[active]!.month}：收入 NT$ ${formatMoney(points[active]!.income)}，支出 NT$ ${formatMoney(points[active]!.expense)}`}</p>
    <table className="sr-only"><caption>每月收入與支出明細</caption><thead><tr><th>月份</th><th>收入</th><th>支出</th></tr></thead><tbody>{points.map((point) => <tr key={point.month}><td>{point.month}</td><td>{point.income}</td><td>{point.expense}</td></tr>)}</tbody></table>
  </div>;
}

export function CategoryChart({ items }: { items: CategoryTotal[] }) {
  const [active, setActive] = useState<string | null>(null);
  if (!items.length) return <div className="analytics-empty">這個月尚無支出，分類分布會在新增支出後顯示。</div>;
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  let offset = 0;
  return <div className="category-chart-layout">
    <svg viewBox="0 0 180 180" role="img" aria-label="支出分類分布圓環圖" className="category-chart">
      <circle cx="90" cy="90" r="63" fill="none" stroke="#edf2ee" strokeWidth="24" />
      {items.map((item, index) => {
        const fraction = Number(item.amount) / total;
        const segment = <circle key={item.categoryId} cx="90" cy="90" r="63" fill="none" stroke={colors[index % colors.length]} strokeWidth="24" strokeDasharray={`${fraction * 395.84} 395.84`} strokeDashoffset={-offset * 395.84} transform="rotate(-90 90 90)" tabIndex={0} onMouseEnter={() => setActive(item.categoryId)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(item.categoryId)} onBlur={() => setActive(null)}><title>{item.categoryName}：NT$ {formatMoney(item.amount)}</title></circle>;
        offset += fraction;
        return segment;
      })}
      <text x="90" y="87" textAnchor="middle" className="donut-center">支出分類</text><text x="90" y="107" textAnchor="middle" className="donut-sub">{items.length} 類</text>
    </svg>
    <div className="category-chart-details"><ul>{items.map((item, index) => <li key={item.categoryId}><span className="category-legend-name"><i style={{ backgroundColor: colors[index % colors.length] }} />{item.categoryName}</span><strong>NT$ {formatMoney(item.amount)}</strong></li>)}</ul><p className="chart-tooltip" role="status">{active ? `${items.find((item) => item.categoryId === active)?.categoryName}：NT$ ${formatMoney(items.find((item) => item.categoryId === active)!.amount)}` : '將滑鼠移至圓環或以 Tab 聚焦，即可查看分類金額。'}</p></div>
  </div>;
}
