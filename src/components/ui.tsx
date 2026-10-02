import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Tone } from '../lib/status';
import { Icon } from './Icon';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Card({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <h2>
          <span>{title}</span>
          {action}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="hint" style={{ marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Alert({ tone = 'warn', children }: { tone?: 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role="status">
      <Icon name="alert" size={18} />
      <div>{children}</div>
    </div>
  );
}

export function ListLink({ to, title, sub, left, right }: { to: string; title: ReactNode; sub?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="list-item">
        {left}
        <div className="main">
          <div className="title">{title}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
        <span className="chev">
          <Icon name="chevron" size={18} />
        </span>
      </Link>
    </li>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 6 }}>
          <h3 style={{ flex: 1, margin: 0 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Fab({ to, label }: { to: string; label: string }) {
  const nav = useNavigate();
  return (
    <button className="fab" onClick={() => nav(to)} aria-label={label} title={label}>
      <Icon name="plus" />
    </button>
  );
}

export function Initialen({ vorname, nachname }: { vorname: string; nachname: string }) {
  return <span className="avatar">{(vorname[0] ?? '') + (nachname[0] ?? '')}</span>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ---------- Toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
