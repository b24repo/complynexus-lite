type DateLike = Date | string;

const toDate = (d: DateLike): Date => (d instanceof Date ? new Date(d.getTime()) : new Date(d));

export function addDays(d: DateLike, n: number): Date {
  const out = toDate(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function addMonths(d: DateLike, n: number): Date {
  const src = toDate(d);
  const day = src.getUTCDate();
  const out = new Date(src.getTime());
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const daysInMonth = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, daysInMonth));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: DateLike): string {
  const x = toDate(d);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

export function isAfter(a: DateLike, b: DateLike): boolean {
  return toDate(a).getTime() > toDate(b).getTime();
}
