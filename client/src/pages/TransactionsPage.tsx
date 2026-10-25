import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Filter, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ChevronDown, ChevronUp } from 'lucide';
import { AppIcon, StateIcon } from '../components/AppIcon';
import { useModalDialog } from '../components/useModalDialog';
import { ApiError } from '../services/api';
import { analyticsKey, addCategory, addTransaction, categoriesKey, getCategories, getTransactions, removeCategory, removeTransaction, renameCategory, transactionsKey, updateTransaction } from '../services/finance';
import type { Category, EntryType, Transaction, TransactionInput, TransactionQuery } from '../services/finance';
import { formatMoney } from '../lib/money';
import { budgetsKey } from '../services/budgets';
import '../styles/finance.css';

type TypeFilter = EntryType | 'ALL';
const labels: Record<EntryType, string> = { INCOME: '收入', EXPENSE: '支出' };
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const emptyInput = (): TransactionInput => ({ type: 'EXPENSE', amount: '', categoryId: '', transactionDate: today(), description: '' });
function errorMessage(error: unknown) { return error instanceof ApiError ? error.message : '操作失敗，請稍後再試。'; }

function ConfirmDialog({ title, description, busy, error, onConfirm, onClose }: { title: string; description: string; busy: boolean; error: string; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useModalDialog(ref);
  return createPortal(<dialog ref={ref} className="finance-dialog" aria-labelledby="confirm-title" aria-describedby="confirm-description" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}>
    <h2 id="confirm-title">{title}</h2><p id="confirm-description">{description}</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <div className="finance-actions"><button type="button" className="button finance-secondary" onClick={onClose} disabled={busy}>取消</button><button type="button" className="button finance-danger" onClick={onConfirm} disabled={busy}>{busy ? '刪除中…' : '確認刪除'}</button></div>
  </dialog>, document.body);
}

function TransactionActions({ item, onEdit, onDelete }: { item: Transaction; onEdit: (item: Transaction) => void; onDelete: (item: Transaction) => void }) {
  const name = item.description || item.category.name;
  return <div className="finance-row-actions"><button type="button" className="finance-icon-button" aria-label={`編輯交易 ${name}`} onClick={() => onEdit(item)}><AppIcon icon={Pencil} size={16} /></button><button type="button" className="finance-icon-button" aria-label={`刪除交易 ${name}`} onClick={() => onDelete(item)}><AppIcon icon={Trash2} size={16} /></button></div>;
}

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [compact, setCompact] = useState(() => Boolean(window.matchMedia?.('(max-width: 900px)').matches));
  const [filter, setFilter] = useState<TypeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sort, setSort] = useState<'transactionDate:desc' | 'transactionDate:asc' | 'amount:desc' | 'amount:asc' | 'createdAt:desc'>('transactionDate:desc');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [input, setInput] = useState<TransactionInput>(emptyInput);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryType, setCategoryType] = useState<EntryType>('EXPENSE');
  const [categoryName, setCategoryName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ kind: 'transaction' | 'category'; id: string; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const transactionTypeRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (formOpen) transactionTypeRef.current?.focus(); }, [formOpen]);
  useEffect(() => { const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { const media = window.matchMedia?.('(max-width: 900px)'); if (!media) return; const update = () => setCompact(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);

  const categories = useQuery({ queryKey: categoriesKey, queryFn: getCategories });
  const [sortBy, sortOrder] = sort.split(':') as [TransactionQuery['sortBy'], TransactionQuery['sortOrder']];
  const query: TransactionQuery = { page, pageSize, search: debouncedSearch, type: filter === 'ALL' ? undefined : filter, categoryId, startDate, endDate, sortBy, sortOrder };
  const validRange = !startDate || !endDate || startDate <= endDate;
  const transactions = useQuery({ queryKey: [...transactionsKey, query], queryFn: () => getTransactions(query), enabled: validRange });
  const available = (categories.data ?? []).filter((item) => item.type === input.type);
  const filterCategories = (categories.data ?? []).filter((item) => filter === 'ALL' || item.type === filter);
  const listed = transactions.data?.items ?? [];
  useEffect(() => { if (transactions.data && page > Math.max(1, transactions.data.totalPages)) setPage(Math.max(1, transactions.data.totalPages)); }, [transactions.data, page]);

  function chooseType(value: TypeFilter) { setFilter(value); setCategoryId(''); setPage(1); }
  function resetFilters() { setFilter('ALL'); setSearch(''); setDebouncedSearch(''); setCategoryId(''); setStartDate(''); setEndDate(''); setSort('transactionDate:desc'); setPageSize(20); setPage(1); }
  function openNew() { setEditing(null); setInput({ ...emptyInput(), type: filter === 'ALL' ? 'EXPENSE' : filter }); setFormError(''); setFormOpen(true); }
  function openEdit(item: Transaction) { setEditing(item); setInput({ type: item.type, amount: item.amount, categoryId: item.category.id, transactionDate: item.transactionDate, description: item.description ?? '' }); setFormError(''); setFormOpen(true); }
  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(input.amount) || !/[1-9]/.test(input.amount)) { setFormError('請輸入大於零、最多兩位小數的金額。'); return; }
    if (!available.some((item) => item.id === input.categoryId)) { setFormError('請選擇符合交易類型的分類。'); return; }
    setSaving(true); setFormError('');
    try { if (editing) await updateTransaction(editing.id, input); else await addTransaction(input); await Promise.all([queryClient.invalidateQueries({ queryKey: transactionsKey }), queryClient.invalidateQueries({ queryKey: analyticsKey }), queryClient.invalidateQueries({ queryKey: budgetsKey })]); setNotice(editing ? '交易已更新。' : '交易已新增。'); setFormOpen(false); setEditing(null); }
    catch (error) { setFormError(errorMessage(error)); } finally { setSaving(false); }
  }
  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (categoryBusy) return; setCategoryBusy(true); setCategoryError('');
    try { if (renaming) await renameCategory(renaming, categoryName); else await addCategory({ name: categoryName, type: categoryType }); await Promise.all([queryClient.invalidateQueries({ queryKey: categoriesKey }), queryClient.invalidateQueries({ queryKey: transactionsKey }), queryClient.invalidateQueries({ queryKey: analyticsKey }), queryClient.invalidateQueries({ queryKey: budgetsKey })]); setNotice(renaming ? '分類名稱已更新。' : '分類已新增。'); setCategoryName(''); setRenaming(null); }
    catch (error) { setCategoryError(errorMessage(error)); } finally { setCategoryBusy(false); }
  }
  async function confirmDelete() {
    if (!deleting || deleteBusy) return; setDeleteBusy(true); setDeleteError('');
    try { if (deleting.kind === 'transaction') { await removeTransaction(deleting.id); await Promise.all([queryClient.invalidateQueries({ queryKey: transactionsKey }), queryClient.invalidateQueries({ queryKey: analyticsKey }), queryClient.invalidateQueries({ queryKey: budgetsKey })]); } else { await removeCategory(deleting.id); await Promise.all([queryClient.invalidateQueries({ queryKey: categoriesKey }), queryClient.invalidateQueries({ queryKey: analyticsKey }), queryClient.invalidateQueries({ queryKey: budgetsKey })]); } setNotice(deleting.kind === 'transaction' ? '交易已刪除。' : '分類已刪除。'); setDeleting(null); }
    catch (error) { setDeleteError(errorMessage(error)); } finally { setDeleteBusy(false); }
  }
  function askDelete(kind: 'transaction' | 'category', id: string, label: string) { setDeleteError(''); setDeleting({ kind, id, label }); }
  function askDeleteTransaction(item: Transaction) { askDelete('transaction', item.id, `${item.transactionDate} ${item.description || item.category.name} NT$ ${formatMoney(item.amount)}`); }

  return <div className="finance-page page-enter">
    <div className="finance-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> 個人財務</div><h1>交易紀錄</h1><p>搜尋、篩選並管理帳戶中的每一筆收支。</p></div><div className="finance-heading-actions"><button type="button" className="button finance-secondary" aria-expanded={categoryOpen} aria-controls="categories-panel" onClick={() => setCategoryOpen((value) => !value)}>管理分類 <StateIcon icon={categoryOpen ? ChevronUp : ChevronDown} size={16} /></button><button type="button" className="button button-primary" onClick={openNew}><AppIcon icon={Plus} size={17} />新增交易</button></div></div>
    {notice && <div className="finance-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="關閉通知"><AppIcon icon={X} size={16} /></button></div>}

    {categoryOpen && <section id="categories-panel" className="finance-card finance-categories" aria-labelledby="categories-title"><div className="finance-section-heading"><h2 id="categories-title">分類管理</h2><button type="button" className="finance-icon-button" aria-label="關閉分類管理" onClick={() => setCategoryOpen(false)}><AppIcon icon={X} size={18} /></button></div>
      <form onSubmit={(event) => void saveCategory(event)} className="finance-category-form"><label>類型<select value={categoryType} onChange={(event) => { setCategoryType(event.target.value as EntryType); setRenaming(null); setCategoryName(''); }} disabled={Boolean(renaming)}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label><label>分類名稱<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} required /></label><button type="submit" className="button button-primary" disabled={categoryBusy}>{categoryBusy ? '儲存中…' : renaming ? '儲存名稱' : '新增分類'}</button>{renaming && <button type="button" className="button finance-secondary" onClick={() => { setRenaming(null); setCategoryName(''); }}>取消編輯</button>}</form>
      {categoryError && <p role="alert" className="auth-error">{categoryError}</p>}
      {categories.isPending ? <p role="status">載入分類中…</p> : categories.isError ? <p role="alert">分類載入失敗。<button type="button" onClick={() => void categories.refetch()}>重試</button></p> : <div className="finance-category-groups">{(['EXPENSE', 'INCOME'] as const).map((type) => <div key={type}><h3>{labels[type]}分類</h3><ul>{categories.data.filter((item) => item.type === type).map((item: Category) => <li key={item.id}><span>{item.name}</span><div><button type="button" className="finance-icon-button" aria-label={`編輯分類 ${item.name}`} onClick={() => { setCategoryType(item.type); setCategoryName(item.name); setRenaming(item.id); setCategoryError(''); }}><AppIcon icon={Pencil} size={16} /></button><button type="button" className="finance-icon-button" aria-label={`刪除分類 ${item.name}`} onClick={() => askDelete('category', item.id, item.name)}><AppIcon icon={Trash2} size={16} /></button></div></li>)}</ul>{!categories.data.some((item) => item.type === type) && <p className="finance-muted">尚無分類</p>}</div>)}</div>}
    </section>}

    {formOpen && <section className="finance-card finance-form-panel" aria-labelledby="transaction-form-title"><div className="finance-section-heading"><h2 id="transaction-form-title">{editing ? '編輯交易' : '新增交易'}</h2><button type="button" className="finance-icon-button" aria-label="關閉交易表單" onClick={() => { if (!saving) setFormOpen(false); }}><AppIcon icon={X} size={18} /></button></div>
      <form onSubmit={(event) => void saveTransaction(event)}><div className="finance-form-grid"><label>類型<select ref={transactionTypeRef} value={input.type} onChange={(event) => setInput({ ...input, type: event.target.value as EntryType, categoryId: '' })}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label><label>金額<input type="text" inputMode="decimal" value={input.amount} onChange={(event) => setInput({ ...input, amount: event.target.value })} placeholder="0.00" required /></label><div className="finance-field"><label htmlFor="transaction-category">分類</label><select id="transaction-category" aria-label="分類" value={input.categoryId} onChange={(event) => setInput({ ...input, categoryId: event.target.value })} required><option value="">請選擇分類</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><label>交易日期<input type="date" value={input.transactionDate} onChange={(event) => setInput({ ...input, transactionDate: event.target.value })} required /></label><label className="finance-wide">說明<input value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} maxLength={500} placeholder="選填" /></label></div>
        {available.length === 0 && <p className="finance-muted">此類型尚無分類，請先使用「管理分類」新增。</p>}{formError && <p role="alert" className="auth-error">{formError}</p>}<div className="finance-actions"><button type="button" className="button finance-secondary" onClick={() => setFormOpen(false)} disabled={saving}>取消</button><button type="submit" className="button button-primary" disabled={saving || categories.isPending}>{saving ? '儲存中…' : editing ? '儲存變更' : '建立交易'}</button></div>
      </form></section>}

    <section className="finance-card finance-results" aria-labelledby="transactions-title"><div className="finance-section-heading"><div><h2 id="transactions-title">所有交易</h2><p className="finance-result-count">{transactions.data ? `符合條件 ${transactions.data.totalItems} 筆` : '依條件搜尋交易'}</p></div><button type="button" className="button finance-secondary finance-mobile-filter-toggle" aria-expanded={filterPanelOpen} aria-controls="finance-filter-panel" onClick={() => setFilterPanelOpen((value) => !value)}><AppIcon icon={Filter} size={16} />篩選 <StateIcon icon={filterPanelOpen ? ChevronUp : ChevronDown} size={16} /></button></div>
      <div id="finance-filter-panel" className={`finance-filter-panel${filterPanelOpen ? ' is-open' : ''}`}><label className="finance-search">搜尋交易<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="說明或分類名稱" maxLength={100} /></label><label>起始日期<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label><label>結束日期<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label><label>分類<select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}><option value="">全部分類</option>{filterCategories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>排序<select value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}><option value="transactionDate:desc">日期：新到舊</option><option value="transactionDate:asc">日期：舊到新</option><option value="amount:desc">金額：高到低</option><option value="amount:asc">金額：低到高</option><option value="createdAt:desc">建立時間：新到舊</option></select></label><label>每頁筆數<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label><button type="button" className="button finance-secondary finance-reset" onClick={resetFilters}>重設篩選</button></div>
      <div className="finance-type-row"><div className="finance-tabs" role="group" aria-label="交易類型">{(['ALL', 'EXPENSE', 'INCOME'] as const).map((type) => <button type="button" key={type} aria-pressed={filter === type} onClick={() => chooseType(type)}>{type === 'ALL' ? '全部' : labels[type]}</button>)}</div></div>
      {!validRange ? <p role="alert" className="analytics-error">起始日期不可晚於結束日期。</p> : transactions.isPending ? <p role="status" className="finance-empty">載入交易中…</p> : transactions.isError ? <div role="alert" className="finance-empty">交易載入失敗。<button type="button" onClick={() => void transactions.refetch()}>重試</button></div> : listed.length === 0 ? <div className="finance-empty"><strong>找不到符合條件的交易</strong><p>調整篩選條件，或建立新的交易。</p><button type="button" className="button finance-secondary" onClick={resetFilters}>清除篩選</button></div> : compact ? <ul className="finance-mobile-list">{listed.map((item) => <li key={item.id}><div className="finance-mobile-main"><span className={`finance-entry-mark ${item.type === 'INCOME' ? 'is-income' : ''}`}>{item.type === 'INCOME' ? '+' : '−'}</span><div><strong>{item.description || item.category.name}</strong><small>{item.category.name} · {item.transactionDate}</small></div></div><div className="finance-mobile-bottom"><strong className={item.type === 'INCOME' ? 'finance-income' : ''}>{item.type === 'INCOME' ? '+' : '−'} NT$ {formatMoney(item.amount)}</strong><TransactionActions item={item} onEdit={openEdit} onDelete={askDeleteTransaction} /></div></li>)}</ul> : <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th scope="col">日期</th><th scope="col">交易名稱／說明</th><th scope="col">分類</th><th scope="col">類型</th><th scope="col" className="finance-align-right">金額</th><th scope="col" className="finance-align-right">操作</th></tr></thead><tbody>{listed.map((item) => <tr key={item.id}><td className="finance-date">{item.transactionDate}</td><td className="finance-description">{item.description || item.category.name}</td><td><span className="finance-category-tag">{item.category.name}</span></td><td><span className={`finance-type-tag ${item.type === 'INCOME' ? 'is-income' : ''}`}>{labels[item.type]}</span></td><td className={`finance-align-right finance-amount ${item.type === 'INCOME' ? 'finance-income' : ''}`}>{item.type === 'INCOME' ? '+' : '−'} NT$ {formatMoney(item.amount)}</td><td className="finance-align-right"><TransactionActions item={item} onEdit={openEdit} onDelete={askDeleteTransaction} /></td></tr>)}</tbody></table></div>}
      {transactions.data && transactions.data.totalPages > 1 && <div className="finance-pagination"><button type="button" className="button finance-secondary" onClick={() => setPage(page - 1)} disabled={page === 1}>上一頁</button><span>第 {page}／{transactions.data.totalPages} 頁</span><button type="button" className="button finance-secondary" onClick={() => setPage(page + 1)} disabled={page >= transactions.data.totalPages}>下一頁</button></div>}
    </section>
    {deleting && <ConfirmDialog title={`刪除${deleting.kind === 'category' ? '分類' : '交易'}？`} description={`確定刪除「${deleting.label}」？此操作無法復原。`} busy={deleteBusy} error={deleteError} onConfirm={() => void confirmDelete()} onClose={() => setDeleting(null)} />}
  </div>;
}
