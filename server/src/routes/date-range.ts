import { transactionDate } from './finance-common.js';

export type DateRange = { startDate: string; endDate: string; start: Date; end: Date };

export function defaultMonth(timeZone = 'Asia/Taipei'): { startDate: string; endDate: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate: `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}` };
}

export function parseDateRange(query: Record<string, unknown>, useDefault = false): DateRange | null | undefined {
  if ((query.startDate === undefined) !== (query.endDate === undefined)) return undefined;
  const fallback = useDefault ? defaultMonth() : null;
  const startDate = query.startDate ?? fallback?.startDate;
  const endDate = query.endDate ?? fallback?.endDate;
  if (startDate === undefined && endDate === undefined) return null;
  if (startDate === undefined || endDate === undefined) return undefined;
  const start = transactionDate.safeParse(startDate);
  const end = transactionDate.safeParse(endDate);
  if (!start.success || !end.success || start.data > end.data) return undefined;
  return { startDate: start.data, endDate: end.data, start: new Date(`${start.data}T00:00:00.000Z`), end: new Date(`${end.data}T00:00:00.000Z`) };
}
