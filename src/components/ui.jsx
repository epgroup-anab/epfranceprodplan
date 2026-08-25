import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { priorityMeta } from '../lib/priority.js';

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-GB');

export function PriorityBadge({ value }) {
  const p = priorityMeta(value);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${p.badge}`}
          title={`${p.value} — ${p.name}: ${p.blurb}`}>
      {p.value} {p.name}
    </span>
  );
}

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    ghost: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:text-slate-300',
    danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  }[variant];
  return (
    <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="text-center py-16 px-6">
      {Icon && <Icon className="w-10 h-10 mx-auto text-slate-300" />}
      <p className="mt-3 font-medium text-slate-700">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">{children}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'bg-blue-50 border-blue-200 text-blue-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }[tone];
  return <div className={`border rounded-lg px-4 py-3 text-sm ${tones}`}>{children}</div>;
}

/** Centred dialog. Escape or a click outside closes it. */
export function Modal({ title, subtitle, onClose, footer, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-slate-900/40"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full ${width} bg-white rounded-xl shadow-xl border border-slate-200 my-auto`}>
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">{footer}</footer>}
      </div>
    </div>
  );
}

/** Label + value pair used inside dialogs and detail panels. */
export const Fact = ({ label, value, hint, tone = '' }) => (
  <div className="bg-slate-50 rounded-lg px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    <div className={`font-semibold text-slate-800 mt-0.5 tabular-nums ${tone}`}>{value}</div>
    {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
  </div>
);

export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500';

/** Table shell that scrolls sideways without pushing the page wide. */
export function TableWrap({ children }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>;
}

export const Th = ({ children, className = '', ...r }) => (
  <th className={`text-left font-medium text-slate-500 px-3 py-2 whitespace-nowrap border-b border-slate-200 ${className}`} {...r}>{children}</th>
);
export const Td = ({ children, className = '', ...r }) => (
  <td className={`px-3 py-2 border-b border-slate-100 ${className}`} {...r}>{children}</td>
);
