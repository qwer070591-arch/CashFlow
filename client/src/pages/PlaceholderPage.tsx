import { ArrowLeft, ChartNoAxesCombined, ListFilter, Settings2, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import type { PageKind } from '../lib/navigation';

const details = {
  transactions: { title: '交易紀錄', icon: ListFilter, description: '未來可在這裡整理每一筆收入與支出。' },
  budgets: { title: '預算規劃', icon: Wallet, description: '未來可在這裡建立每月預算，追蹤重要目標。' },
  insights: { title: '財務分析', icon: ChartNoAxesCombined, description: '詳細分析頁面仍在規劃；總覽已提供真實的收支趨勢與分類統計。' },
  settings: { title: '設定', icon: Settings2, description: '未來可在這裡調整個人偏好與工作空間。' },
} as const;

export function PlaceholderPage({ kind }: { kind: PageKind }) {
  const { title, icon: Icon, description } = details[kind];
  return <div className="placeholder-page page-enter"><div className="eyebrow"><span className="eyebrow-line" /> 工作空間</div><h1>{title}</h1><div className="placeholder-card"><span className="placeholder-icon"><Icon size={35} strokeWidth={1.5} /></span><span className="placeholder-pill">規劃中</span><h2>詳細分析頁面正在規劃。</h2><p>{description}</p><Link className="button button-primary" to="/"><ArrowLeft size={17} /> 查看總覽統計</Link></div></div>;
}
