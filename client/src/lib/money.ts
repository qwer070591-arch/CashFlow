export function formatMoney(value: string) {
  const negative = value.startsWith('-');
  const [integer, cents = ''] = (negative ? value.slice(1) : value).split('.');
  return `${negative ? '−' : ''}${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents.padEnd(2, '0')}`;
}

export function currentMonthRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const part = (value: number) => String(value).padStart(2, '0');
  return { startDate: `${year}-${part(month + 1)}-01`, endDate: `${year}-${part(month + 1)}-${part(new Date(year, month + 1, 0).getDate())}` };
}

export function recentMonthsRange(count = 6, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - count + 1, 1);
  return { startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`, endDate: currentMonthRange(now).endDate };
}
