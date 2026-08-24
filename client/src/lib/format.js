/** Rupees, no decimals — every price in this product is a whole number. */
export const inr = (n) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Compact form for dashboard tiles: ₹1.2L, ₹45.6K. */
export const inrCompact = (n) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return inr(v);
};

export const num = (n) => Number(n ?? 0).toLocaleString('en-IN');

export const pct = (n) => `${Math.round(Number(n ?? 0))}%`;

/* --------------------------------- dates --------------------------------- */

const DATE_OPTS = { day: 'numeric', month: 'short' };
const TIME_OPTS = { hour: 'numeric', minute: '2-digit', hour12: true };

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', DATE_OPTS) : '—';

export const formatTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', TIME_OPTS) : '—';

export const formatDateTime = (d) => (d ? `${formatDate(d)}, ${formatTime(d)}` : '—');

/** "in 12 min", "3 h ago" — the phrasing a status line wants. */
export function relativeTime(d) {
  if (!d) return '—';
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;

  const units = [
    [60_000, 'min', 1000 * 60],
    [3_600_000, 'h', 1000 * 60 * 60],
    [86_400_000, 'd', 1000 * 60 * 60 * 24],
  ];

  if (abs < 60_000) return future ? 'in a moment' : 'just now';

  for (const [limit, label, ms] of units) {
    if (abs < limit * 60 || label === 'd') {
      const v = Math.round(abs / ms);
      return future ? `in ${v} ${label}` : `${v} ${label} ago`;
    }
  }
  return formatDate(d);
}

/** Seconds remaining, as mm:ss — used by the offer countdown. */
export const countdown = (until) => {
  const s = Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const secondsUntil = (until) =>
  Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000));

/* -------------------------------- strings -------------------------------- */

export const titleCase = (s) =>
  String(s ?? '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const initials = (name) =>
  String(name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export const km = (n) => (n == null ? '—' : `${Number(n).toFixed(1)} km`);

export const mins = (n) => {
  if (n == null) return '—';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
