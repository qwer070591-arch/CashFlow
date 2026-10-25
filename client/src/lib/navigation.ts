import { ChartNoAxesCombined, LayoutDashboard, ListFilter, Settings2, Wallet } from 'lucide-react';

export const navigation = [
  { path: '/', label: '總覽', icon: LayoutDashboard },
  { path: '/transactions', label: '交易紀錄', icon: ListFilter },
  { path: '/budgets', label: '預算規劃', icon: Wallet },
  { path: '/insights', label: '財務分析', icon: ChartNoAxesCombined },
  { path: '/settings', label: '設定', icon: Settings2 },
] as const;

export type PageKind = 'transactions' | 'budgets' | 'insights' | 'settings';
