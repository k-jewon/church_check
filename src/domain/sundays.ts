// service_date is stored as 'YYYY-MM-DD'. Every attendance date is a Sunday.
// All functions are pure (take `today` explicitly) so they are testable.

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Most recent Sunday on or before `today` (if today is Sunday, today itself).
export function currentSunday(today: Date): string {
  const s = new Date(today);
  s.setDate(today.getDate() - today.getDay()); // getDay(): 0 = Sunday
  return toISO(s);
}

// Most recent `n` Sundays including the current one, in chronological order.
export function recentSundays(today: Date, n: number): string[] {
  const cur = fromISO(currentSunday(today));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cur);
    d.setDate(cur.getDate() - i * 7);
    out.push(toISO(d));
  }
  return out;
}

// Every Sunday between two dates (inclusive), chronological.
export function sundaysInRange(fromDateISO: string, toDateISO: string): string[] {
  const start = fromISO(fromDateISO);
  const end = fromISO(toDateISO);
  // advance start to its week's Sunday
  const s = new Date(start);
  s.setDate(start.getDate() - start.getDay());
  const out: string[] = [];
  for (let d = new Date(s); d <= end; d.setDate(d.getDate() + 7)) {
    if (d >= start) out.push(toISO(d));
  }
  return out;
}

// Same day `n` months later, clamped to that month's last day (08-31 + 6 -> 02-28).
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const out = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(d, lastDay));
  return toISO(out);
}

export function isSunday(iso: string): boolean {
  return fromISO(iso).getDay() === 0;
}
