import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { prefersReducedMotion, project, rubberband, Spring, SPRING, VelocityTracker } from '../lib/spring';
import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert, LuX } from 'react-icons/lu';
import { Link } from '../lib/router';
import type { CategoryStatus, ConnectionStatus, DataSource, DateStatus, IncomeStatus, TaskPriority } from '../../shared/types';

// ───── brand
export function LogoMark({ reverse = false, size = 30 }: { reverse?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="8" y="23" width="9" height="9" fill={reverse ? '#a5bf8f' : '#3b773f'} />
      <rect x="17" y="14" width="9" height="9" fill={reverse ? '#c8dfb5' : '#19522f'} />
      <rect x="26" y="5" width="12" height="38" fill={reverse ? '#f3f2ed' : '#143e29'} />
    </svg>
  );
}
export function Logo({ to = '/', reverse = false }: { to?: string; reverse?: boolean }) {
  return (
    <Link to={to} className={`logo ${reverse ? 'reverse' : ''}`} aria-label="FirstStep home" aria-current={undefined}>
      <LogoMark reverse={reverse} />
      <span>
        First<span className="step">Step</span>
      </span>
    </Link>
  );
}

// ───── buttons
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', size, loading, arrow, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'lg'; loading?: boolean; arrow?: boolean }) {
  return (
    <button type="button" className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} disabled={rest.disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
      {arrow && !loading && <span className="arrow" aria-hidden="true">↗</span>}
    </button>
  );
}
export function ButtonLink({ to, variant = 'primary', size, arrow, children, className = '' }: { to: string; variant?: BtnVariant; size?: 'sm' | 'lg'; arrow?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} aria-current={undefined}>
      {children}
      {arrow && <span className="arrow" aria-hidden="true">↗</span>}
    </Link>
  );
}

// ───── forms
export function Field({ label, help, error, children, id, optional }: { label: ReactNode; help?: ReactNode; error?: string | null; children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode; id?: string; optional?: boolean }) {
  const auto = useId();
  const fid = id ?? auto;
  const helpId = help ? `${fid}-help` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>
        {label} {optional && <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>}
      </label>
      {children({ id: fid, 'aria-describedby': [helpId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? true : undefined })}
      {help && <span id={helpId} className="help">{help}</span>}
      {error && <span id={errId} className="error-text">{error}</span>}
    </div>
  );
}

const parseNum = (s: string): number | null => {
  const t = s.replace(/[$,%\s]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Numeric input that keeps the user's typing intact and reports parsed numbers (null when empty). */
export function NumberInput({ value, onChange, prefix, suffix, min = 0, max, step, ...rest }: { value: number | null; onChange: (n: number | null) => void; prefix?: string; suffix?: string; min?: number; max?: number; step?: number; id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-label'?: string; placeholder?: string; disabled?: boolean }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === null || value === undefined ? '' : String(value));
  }, [value]);
  const input = (
    <input
      {...rest}
      className="input num"
      inputMode="decimal"
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        const n = parseNum(text);
        setText(n === null ? '' : String(n));
      }}
      onChange={(e) => {
        setText(e.target.value);
        let n = parseNum(e.target.value);
        if (n !== null) {
          if (min !== undefined && n < min) n = min;
          if (max !== undefined && n > max) n = max;
        }
        onChange(n);
      }}
    />
  );
  if (prefix)
    return (
      <div className="money">
        <span aria-hidden="true">{prefix}</span>
        {input}
      </div>
    );
  if (suffix)
    return (
      <div style={{ position: 'relative' }}>
        {input}
        <span aria-hidden="true" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
          {suffix}
        </span>
      </div>
    );
  return input;
}
export const MoneyInput = (p: Parameters<typeof NumberInput>[0]) => <NumberInput prefix="$" {...p} />;

// ───── badges
const SOURCE_LABEL: Record<DataSource, string> = { imported: 'Imported', manual: 'Entered by you', estimated: 'Estimated', verified: 'Verified by you', connected: 'From connected account', demo: 'Demo data' };
export function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`badge badge-${source}`}>{SOURCE_LABEL[source]}</span>;
}
const DATE_LABEL: Record<DateStatus, string> = { confirmed: 'Confirmed', user_entered: 'Entered by you', estimated: 'Estimated', unknown: 'Unknown' };
export function DateStatusBadge({ status }: { status: DateStatus }) {
  const cls = status === 'confirmed' ? 'confirmed' : status === 'estimated' ? 'estimated' : status === 'unknown' ? 'unknown' : 'manual';
  return <span className={`badge badge-${cls}`}>{DATE_LABEL[status]}</span>;
}
const CAT_LABEL: Record<CategoryStatus, string> = { confirmed: 'Confirmed', estimated: 'Estimated', needs_review: 'Needs review' };
export function CategoryStatusBadge({ status }: { status: CategoryStatus }) {
  return <span className={`badge badge-${status === 'needs_review' ? 'review' : status}`}>{CAT_LABEL[status]}</span>;
}
const INCOME_LABEL: Record<IncomeStatus, string> = { confirmed: 'Confirmed', estimated: 'Estimated', variable: 'Varies', not_available: 'Not yet available' };
export function IncomeStatusBadge({ status }: { status: IncomeStatus }) {
  return <span className={`badge badge-${status === 'confirmed' ? 'confirmed' : status === 'not_available' ? 'unknown' : 'estimated'}`}>{INCOME_LABEL[status]}</span>;
}
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`badge badge-${priority}`}>{priority === 'high' ? 'High priority' : priority === 'medium' ? 'Medium' : 'Low'}</span>;
}
const CONN_LABEL: Record<ConnectionStatus, string> = { not_connected: 'Not connected', connecting: 'Connecting…', connected: 'Connected', needs_attention: 'Needs attention', disconnected: 'Disconnected' };
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const cls = status === 'connected' ? 'success' : status === 'needs_attention' ? 'error' : status === 'connecting' ? 'estimated' : 'unknown';
  return <span className={`badge badge-${cls}`}>{CONN_LABEL[status]}</span>;
}

// ───── feedback
export function Alert({ kind = 'info', title, children, onDismiss }: { kind?: 'info' | 'warn' | 'error' | 'success'; title?: ReactNode; children?: ReactNode; onDismiss?: () => void }) {
  const Icon = kind === 'error' ? LuCircleAlert : kind === 'warn' ? LuTriangleAlert : kind === 'success' ? LuCircleCheck : LuInfo;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon aria-hidden="true" size={18} />
      <div className="stack stack-sm" style={{ flex: 1 }}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {onDismiss && (
        <button className="icon-btn" style={{ width: 28, height: 28, border: 0 }} onClick={onDismiss} aria-label="Dismiss">
          <LuX aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div className="muted small" style={{ maxWidth: '52ch' }}>{children}</div>}
      {action}
    </div>
  );
}

export function HowCalculated({ children, label = 'How is this calculated?' }: { children: ReactNode; label?: string }) {
  return (
    <details className="how">
      <summary>{label}</summary>
      <div>{children}</div>
    </details>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Ring({ value, size = 96, label }: { value: number; size?: number; label: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${Math.round(v)} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-muted-surface)" strokeWidth="12" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-primary)" strokeWidth="12" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="57" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--color-text)" style={{ letterSpacing: '-0.04em' }}>
        {Math.round(v)}
      </text>
    </svg>
  );
}

// ───── dialog / sheet
// Native <dialog> keeps focus trapping, Esc and the inert background. Motion is spring-driven:
// desktop panels materialize (scale + opacity); on phones the panel is a bottom sheet that tracks the
// finger 1:1, rubber-bands upward, projects a flick's momentum and dismisses along the path it came in.

function useMedia(query: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isSheet = useMedia('(max-width: 640px)');
  const [mounted, setMounted] = useState(open);
  const mode = useRef<'sheet' | 'panel'>('panel');
  const spring = useRef<Spring | null>(null);
  const drag = useRef<{ id: number; startY: number; startV: number; active: boolean } | null>(null);
  const vt = useRef(new VelocityTracker());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const height = () => panel.current?.offsetHeight || window.innerHeight;
  const hidden = () => (mode.current === 'sheet' ? height() : 0);
  const shown = () => (mode.current === 'sheet' ? 0 : 1);

  const apply = (v: number) => {
    const p = panel.current;
    const s = scrim.current;
    if (!p || !s) return;
    const reduce = prefersReducedMotion();
    if (mode.current === 'sheet') {
      const h = height();
      p.style.transform = reduce ? '' : `translate3d(0, ${v}px, 0)`;
      const t = Math.max(0, Math.min(1, 1 - v / h));
      s.style.opacity = String(t);
      if (reduce) p.style.opacity = String(t);
    } else {
      const t = Math.max(0, Math.min(1, v));
      p.style.opacity = String(t);
      p.style.transform = reduce ? '' : `scale(${0.95 + 0.05 * t})`;
      s.style.opacity = String(t);
    }
  };

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Present / dismiss. Always animate from the spring's current value so it can be interrupted.
  useLayoutEffect(() => {
    const d = ref.current;
    if (!mounted || !d) return;
    if (open) {
      if (d.classList.contains('closing')) {
        // Reopened mid-exit: grab it from where it is and become modal again.
        d.classList.remove('closing');
        d.close();
        d.showModal();
      } else if (!d.open) {
        mode.current = isSheet ? 'sheet' : 'panel';
        d.showModal();
        spring.current = new Spring(0, apply);
        spring.current.set(hidden());
      }
      spring.current?.to(shown(), mode.current === 'sheet' ? SPRING.sheet : SPRING.default);
    } else if (d.open) {
      // Release the modal lock immediately (focus returns, page is interactive again) and let the
      // panel finish leaving as a non-blocking layer — input is never locked out during a transition.
      d.close();
      d.show();
      d.classList.add('closing');
      const finish = () => {
        d.classList.remove('closing');
        d.close();
        setMounted(false);
      };
      if (prefersReducedMotion()) finish();
      else spring.current?.to(hidden(), SPRING.default, { onRest: finish });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useEffect(() => () => spring.current?.stop(), []);

  const onPointerDown = (e: RPointerEvent) => {
    if (mode.current !== 'sheet' || !spring.current) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
    drag.current = { id: e.pointerId, startY: e.clientY, startV: spring.current.value, active: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    spring.current.stop(); // grab it mid-flight
    vt.current.reset();
    vt.current.add(spring.current.value);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !spring.current) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 10) return; // hysteresis before committing to a drag
      d.active = true;
      d.startY = e.clientY;
    }
    let v = d.startV + (e.clientY - d.startY);
    if (v < 0) v = rubberband(v, height()); // soft boundary when pulled up
    spring.current.set(v);
    vt.current.add(v);
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !spring.current) return;
    if (!d.active) {
      spring.current.to(shown(), SPRING.default); // a tap: resume where it was headed
      return;
    }
    const velocity = vt.current.velocity();
    const projected = spring.current.value + project(velocity);
    if (projected > height() * 0.45) {
      spring.current.to(hidden(), SPRING.default, { velocity });
      closeRef.current();
    } else {
      // Bounce only because the gesture carried momentum.
      spring.current.to(0, Math.abs(velocity) > 400 ? SPRING.sheet : SPRING.default, { velocity });
    }
  };

  if (!mounted) return null;
  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onCancel={(e) => (e.preventDefault(), onClose())}>
      <div ref={scrim} className="dialog-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={`dialog-panel ${wide ? 'wide' : ''}`} style={{ opacity: 0 }}>
        <div className="dialog-drag" {...dragProps}>
          <div className="dialog-grabber" aria-hidden="true" />
          <div className="dialog-head">
            <h2 id={titleId} className="h3">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <LuX aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

// ───── segmented control (WAI-ARIA tabs, arrow-key navigation, spring-driven selection thumb)
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  const list = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const xs = useRef<Spring | null>(null);
  const ws = useRef<Spring | null>(null);
  const measure = (animate: boolean) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    const t = thumb.current;
    if (!el || !t) return;
    // X and width get independent springs so they stay in sync even with different velocities.
    xs.current ??= new Spring(el.offsetLeft, (v) => (t.style.transform = `translate3d(${v}px, 0, 0)`));
    ws.current ??= new Spring(el.offsetWidth, (v) => (t.style.width = `${v}px`));
    if (animate) {
      xs.current.to(el.offsetLeft, SPRING.move);
      ws.current.to(el.offsetWidth, SPRING.move);
    } else {
      xs.current.set(el.offsetLeft);
      ws.current.set(el.offsetWidth);
    }
    const box = list.current!;
    if (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: el.offsetLeft - 16, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const first = useRef(true);
  useLayoutEffect(() => {
    measure(!first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    const on = () => measure(false);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => () => (xs.current?.stop(), ws.current?.stop()), []);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    list.current?.querySelector<HTMLElement>(`[data-tab="${tabs[n].id}"]`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={list}>
      <span className="tabs-thumb" ref={thumb} aria-hidden="true" />
      {tabs.map((t, i) => (
        <button key={t.id} data-tab={t.id} id={`tab-${t.id}`} role="tab" className="tab" aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1} onPointerDown={() => value !== t.id && onChange(t.id)} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="big-num">{value}</span>
      {sub && <span className="small muted">{sub}</span>}
      {children}
    </div>
  );
}
