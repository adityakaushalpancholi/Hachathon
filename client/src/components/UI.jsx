import { useEffect } from 'react';
import {
  Loader2, Star, ShieldCheck, X, AlertCircle, Inbox, RefreshCw,
} from 'lucide-react';
import { initials, titleCase } from '../lib/format.js';
import { STATUS_META } from '../lib/status.js';

/* -------------------------------- loading -------------------------------- */

export const Spinner = ({ size = 18, className = '' }) => (
  <Loader2 size={size} className={`animate-spin ${className}`} />
);

export const Skeleton = ({ className = 'h-4 w-full' }) => (
  <div className={`skeleton ${className}`} />
);

export function LoadingBlock({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/* --------------------------- empty & error states ------------------------ */

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-navy-200 bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-navy-100 p-3 text-navy-400">
        <Icon size={22} />
      </div>
      <p className="font-semibold text-navy-800">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-navy-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-900">Could not load this</p>
        <p className="mt-0.5 text-sm text-red-700">{error?.message || 'Something went wrong.'}</p>
      </div>
      {onRetry && (
        <button onClick={() => onRetry()} className="btn-outline btn-sm shrink-0">
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

/**
 * Standard wrapper for a data region: renders the skeleton, the error or the
 * children, so no panel has to re-implement the three-state dance.
 */
export function Async({ loading, error, data, onRetry, skeleton, empty, children }) {
  if (loading && !data) return skeleton ?? <LoadingBlock />;
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} />;
  if (empty && (!data || (Array.isArray(data) && data.length === 0))) return empty;
  return children;
}

/* --------------------------------- stats --------------------------------- */

export function StatCard({ icon: Icon, label, value, sub, tone = 'navy', className = '' }) {
  const tones = {
    navy: 'bg-navy-100 text-navy-700',
    coop: 'bg-coop-100 text-coop-700',
    saffron: 'bg-saffron-100 text-saffron-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <div className={`card-pad ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-navy-500">
            {label}
          </p>
          <p className="tnum mt-1.5 text-2xl font-bold tracking-tight text-navy-900">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-navy-500">{sub}</p>}
        </div>
        {Icon && (
          <div className={`shrink-0 rounded-lg p-2 ${tones[tone]}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- ratings -------------------------------- */

export function RatingStars({ value = 0, count, size = 14, showValue = true }) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={
              i <= rounded
                ? 'fill-amber-400 text-amber-400'
                : i - 0.5 === rounded
                  ? 'fill-amber-200 text-amber-400'
                  : 'text-navy-200'
            }
          />
        ))}
      </span>
      {showValue && (
        <span className="tnum text-sm font-semibold text-navy-800">
          {value ? value.toFixed(1) : 'New'}
        </span>
      )}
      {count != null && count > 0 && (
        <span className="text-xs text-navy-400">({count})</span>
      )}
    </span>
  );
}

/* -------------------------------- identity ------------------------------- */

export function Avatar({ name, src, size = 40, className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-navy-800 font-bold text-white ${className}`}
    >
      {initials(name)}
    </div>
  );
}

export const VerificationBadge = ({ status }) => {
  const map = {
    verified: { cls: 'badge-coop', label: 'Verified' },
    pending: { cls: 'badge-amber', label: 'Pending review' },
    rejected: { cls: 'badge-red', label: 'Rejected' },
    suspended: { cls: 'badge-red', label: 'Suspended' },
  };
  const m = map[status] ?? map.pending;

  return (
    <span className={m.cls}>
      <ShieldCheck size={12} /> {m.label}
    </span>
  );
};

/** Booking lifecycle chip, coloured by phase. */
export const StatusPill = ({ status, className = '' }) => {
  const meta = STATUS_META[status] ?? { cls: 'badge-navy', label: titleCase(status) };
  return <span className={`${meta.cls} ${className}`}>{meta.label}</span>;
};

/* --------------------------------- modal --------------------------------- */

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-navy-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lift sm:rounded-2xl ${widths[size]}`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-navy-100 px-5 py-4">
          <h2 className="panel-title">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm -mr-2" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-navy-100 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- misc ---------------------------------- */

export function SectionHeader({ title, hint, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="panel-title">{title}</h2>
        {hint && <p className="muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Horizontal chip row — filters, tags, skills. */
export function ChipRow({ options, value, onChange, allLabel = 'All' }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {allLabel && (
        <button
          onClick={() => onChange(null)}
          className={`badge shrink-0 border transition ${
            value == null
              ? 'border-navy-900 bg-navy-900 text-white'
              : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300'
          }`}
        >
          {allLabel}
        </button>
      )}
      {options.map((o) => {
        const val = o.value ?? o;
        const label = o.label ?? titleCase(o);
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`badge shrink-0 whitespace-nowrap border transition ${
              value === val
                ? 'border-navy-900 bg-navy-900 text-white'
                : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled progress bar, 0–100. */
export function Progress({ value, tone = 'coop', className = '' }) {
  const tones = { coop: 'bg-coop-500', saffron: 'bg-saffron-500', navy: 'bg-navy-700', red: 'bg-red-500' };
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-navy-100 ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${tones[tone]}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
