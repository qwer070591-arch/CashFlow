import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { AppIcon } from '../components/AppIcon';
import { BudgetProgress } from '../components/BudgetProgress';
import { useModalDialog } from '../components/useModalDialog';
import { currentMonthRange, formatMoney } from '../lib/money';
import { ApiError } from '../services/api';
import { addBudget, budgetsKey, getBudgetSummary, removeBudget, updateBudget } from '../services/budgets';
import type { Budget, BudgetSummary } from '../services/budgets';
import { categoriesKey, getCategories } from '../services/finance';
import type { Category } from '../services/finance';

const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
function errorText(error: unknown) { return error instanceof ApiError ? error.message : '操作失敗，請稍後重試。'; }

function BudgetEditor({ budget, month, categories, onClose, onSaved }: {
  budget: Budget | null; month: string; categories: Category[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const [targetMonth, setTargetMonth] = useState(budget?.month ?? month);
  const [kind, setKind] = useState<'overall' | 'category'>(budget?.categoryId ? 'category' : 'overall');
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? '');
  const [value, setValue] = useState(budget?.amount ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choices = categories.filter((item) => item.type === 'EXPENSE');
  useModalDialog(ref, firstRef);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!amountPattern.test(value) || !/[1-9]/.test(value)) { setError('請輸入大於 0、最多兩位小數的金額。'); return; }
    if (kind === 'category' && !categoryId) { setError('請選擇支出分類。'); return; }
    setBusy(true); setError('');
    try {
      if (budget) await updateBudget(budget.id, value);
      else await addBudget({ month: targetMonth, categoryId: kind === 'overall' ? null : categoryId, amount: value });
      await onSaved(); onClose();
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }

  return createPortal(<dialog ref={ref} className="budget-dialog" aria-labelledby="budget-dialog-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <form onSubmit={(event) => void save(event)}><div className="budget-dialog-heading"><span className="budget-dialog-icon"><AppIcon icon={Wallet} size={20} /></span><div><span className="section-overline">MONTHLY PLAN</span><h2 id="budget-dialog-title">{budget ? '編輯預算額度' : '新增月預算'}</h2></div><button type="button" className="budget-dialog-close" aria-label="關閉預算對話框" onClick={onClose} disabled={busy}><AppIcon icon={X} size={18} /></button></div>
      <label>月份<input ref={firstRef} type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} disabled={Boolean(budget)} required /></label>
      <label>預算類型<select value={kind} onChange={(event) => { setKind(event.target.value as 'overall' | 'category'); setCategoryId(''); }} disabled={Boolean(budget)}><option value="overall">整體月預算</option><option value="category">分類月預算</option></select></label>
      {kind === 'category' && <label>支出分類<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={Boolean(budget)} required><option value="">請選擇分類</option>{choices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      {kind === 'category' && choices.length === 0 && <p className="budget-dialog-hint">尚無支出分類。可先到交易頁建立分類。</p>}
      <label>預算金額（NT$）<input type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="例如 30000.00" required /></label>
      {budget && <p className="budget-dialog-hint">調整月份或分類時，請刪除這筆預算後重新建立。</p>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      <div className="budget-dialog-actions"><button type="button" className="button finance-secondary" onClick={onClose} disabled={busy}>取消</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? '儲存中…' : budget ? '儲存變更' : '建立預算'}</button></div>
    </form>
  </dialog>, document.body);
}

function DeleteBudgetDialog({ budget, onClose, onDeleted }: { budget: Budget; onClose: () => void; onDeleted: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useModalDialog(ref);
  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { await removeBudget(budget.id); await onDeleted(); onClose(); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  return createPortal(<dialog ref={ref} className="budget-dialog" aria-labelledby="delete-budget-title" aria-describedby="delete-budget-description" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <div className="budget-dialog-heading"><h2 id="delete-budget-title">刪除預算？</h2><button type="button" className="budget-dialog-close" aria-label="關閉預算對話框" onClick={onClose} disabled={busy}><AppIcon icon={X} size={18} /></button></div><p id="delete-budget-description">確定刪除 {budget.month} 的「{budget.category?.name ?? '整體月預算'}」嗎？交易與分類資料會保留。</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div className="budget-dialog-actions"><button type="button" className="button finance-secondary" onClick={onClose} disabled={busy}>取消</button><button type="button" className="button finance-danger" onClick={() => void confirm()} disabled={busy}>{busy ? '刪除中…' : '確認刪除'}</button></div>
  </dialog>, document.body);
}

function Overall({ data, onAdd, onEdit, onDelete }: { data: BudgetSummary; onAdd: () => void; onEdit: (budget: Budget) => void; onDelete: (budget: Budget) => void }) {
  const budget = data.overallBudget;
  return <section className="budget-overall" aria-labelledby="budget-overall-title"><div className="budget-section-head"><div><span className="section-overline">MONTHLY OVERVIEW</span><h2 id="budget-overall-title">整體月預算</h2></div>{budget && <div className="budget-inline-actions"><button type="button" aria-label="編輯整體月預算" onClick={() => onEdit(budget)}><AppIcon icon={Pencil} size={16} /></button><button type="button" aria-label="刪除整體月預算" onClick={() => onDelete(budget)}><AppIcon icon={Trash2} size={16} /></button></div>}</div>
    {budget ? <><div className="budget-overall-metrics"><div><span>預算額度</span><strong>NT$ {formatMoney(budget.amount)}</strong></div><div><span>本月支出</span><strong>NT$ {formatMoney(budget.spent)}</strong></div><div><span>剩餘額度</span><strong className={budget.status === 'OVER_BUDGET' ? 'is-over' : ''}>NT$ {formatMoney(budget.remaining)}</strong></div></div><BudgetProgress budget={budget} /></>
      : <div className="budget-overall-empty"><p>這個月尚未設定整體預算。</p><p>本月實際支出：<strong>NT$ {formatMoney(data.totalExpense)}</strong></p><button type="button" className="button button-primary" onClick={onAdd}><AppIcon icon={Plus} size={16} />建立整體預算</button></div>}
  </section>;
}

export function BudgetPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => currentMonthRange().startDate.slice(0, 7));
  const [editor, setEditor] = useState<Budget | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [notice, setNotice] = useState('');
  const summary = useQuery({ queryKey: [...budgetsKey, 'summary', month], queryFn: () => getBudgetSummary(month) });
  const categories = useQuery({ queryKey: categoriesKey, queryFn: getCategories });
  const data = summary.data;
  async function refresh() { await queryClient.invalidateQueries({ queryKey: budgetsKey }); setNotice(editor === 'new' ? '預算已建立。' : deleting ? '預算已刪除。' : '預算已更新。'); }
  const monthLabel = month.replace('-', ' 年 ') + ' 月';

  return <div className="budget-page page-enter"><div className="budget-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> 個人財務</div><h1>預算管理</h1><p>為每個月份設定支出範圍，清楚掌握已使用與剩餘額度。</p></div><button type="button" className="button button-primary" onClick={() => setEditor('new')}><AppIcon icon={Plus} size={17} />新增預算</button></div>
    <div className="budget-month-row"><label><AppIcon icon={CalendarDays} size={17} />查看月份 <input type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label><span>{monthLabel}</span></div>
    {notice && <p className="finance-notice" role="status">{notice}</p>}
    {summary.isPending ? <div className="budget-loading" role="status">正在載入預算與本月支出…</div> : summary.isError ? <div className="budget-error" role="alert">預算資料暫時無法載入。<button type="button" className="button finance-secondary" onClick={() => void summary.refetch()}>重試</button></div> : data && <>
      <Overall data={data} onAdd={() => setEditor('new')} onEdit={setEditor} onDelete={setDeleting} />
      <section className="budget-categories" aria-labelledby="budget-category-title"><div className="budget-section-head"><div><span className="section-overline">CATEGORY PLANS</span><h2 id="budget-category-title">分類月預算</h2><p>同一筆支出可同時計入整體與所屬分類，兩種額度不會相加。</p></div><span className="budget-count">{data.categoryBudgets.length} 個分類</span></div>
        {data.categoryBudgets.length === 0 ? <div className="budget-category-empty"><strong>尚未設定分類預算</strong><p>先建立支出分類，再為重要項目設定每月額度。</p>{categories.data?.some((item) => item.type === 'EXPENSE') ? <button type="button" className="button finance-secondary" onClick={() => setEditor('new')}>新增分類預算</button> : <Link to="/transactions" className="button finance-secondary">前往管理分類</Link>}</div> : <div className="budget-card-grid">{[...data.categoryBudgets].sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'zh-TW')).map((budget) => <article className="budget-card" key={budget.id}><div className="budget-card-title"><div><span className="budget-category-icon"><AppIcon icon={Wallet} size={19} /></span><h3>{budget.category?.name}</h3></div><div className="budget-inline-actions"><button type="button" aria-label={`編輯預算 ${budget.category?.name}`} onClick={() => setEditor(budget)}><AppIcon icon={Pencil} size={16} /></button><button type="button" aria-label={`刪除預算 ${budget.category?.name}`} onClick={() => setDeleting(budget)}><AppIcon icon={Trash2} size={16} /></button></div></div><div className="budget-card-amount"><span>已使用</span><strong>NT$ {formatMoney(budget.spent)}</strong><small>／ NT$ {formatMoney(budget.amount)}</small></div><BudgetProgress budget={budget} /><p className="budget-card-remaining">剩餘 <strong>NT$ {formatMoney(budget.remaining)}</strong></p></article>)}</div>}
        {data.categoryBudgets.length > 0 && <p className="budget-counters">接近上限 {data.nearLimitCount} 個 · 達到上限 {data.atLimitCount} 個 · 已超支 {data.overBudgetCount} 個</p>}
      </section>
    </>}
    {editor && <BudgetEditor budget={editor === 'new' ? null : editor} month={month} categories={categories.data ?? []} onClose={() => setEditor(null)} onSaved={refresh} />}
    {deleting && <DeleteBudgetDialog budget={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />}
  </div>;
}
