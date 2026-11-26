import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ───────── Форматлах ───────── */
import { t } from '../i18n.js';
export const fmtDate = (v) => {
  if (!v) return '—';
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return `${fmtDate(v)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`);

/* ───────── Өгөгдөл уншиx hook ───────── */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
    }));
    fnRef
      .current()
      .then(
        (data) =>
          alive &&
          setState({
            loading: false,
            error: null,
            data,
          }),
      )
      .catch(
        (error) =>
          alive &&
          setState({
            loading: false,
            error,
            data: null,
          }),
      );
    return () => {
      alive = false;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => run(), [run]);
  return {
    ...state,
    reload: run,
  };
}

/* ───────── Хуудасны бүтэц ───────── */
export function Page({ crumb, title, subtitle, actions, children, footer }) {
  useEffect(() => {
    document.title = t('{{v0}} · Цахим виз', {
      v0: title,
    });
  }, [title]);
  return (
    <div className="page">
      <nav className="crumb" aria-label="Breadcrumb">
        <Link to="/">{t('Цахим виз')}</Link>
        {crumb?.map((c, i) => (
          <span key={i}>
            {' '}
            <span className="sep">/</span> {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </nav>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
      {footer && <div className="page-footer">{footer}</div>}
    </div>
  );
}
/**
 * Хүснэгтийн хүрээ. Хэвтээ гүйлттэй болсон үед л гарнаас фокус авна (WCAG 2.1.1, axe scrollable-region-focusable):
 * tabIndex=0 + role="region" + нэр. Гүйлтгүй үед Tab дарааллыг бохирдуулахгүй.
 */
export function TableWrap({ label, className = '', children, ...p }) {
  const ref = useRef(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);
  const focusable = scrolls ? { tabIndex: 0, role: 'region', 'aria-label': label || t('Хүснэгт') } : {};
  return (
    <div ref={ref} className={`table-wrap ${className}`.trim()} {...focusable} {...p}>
      {children}
    </div>
  );
}
export const Card = ({ children, className = '', ...p }) => (
  <section className={`card ${className}`} {...p}>
    {children}
  </section>
);
export function Button({ variant = 'primary', loading, children, className = '', ...p }) {
  return (
    <button className={`btn btn-${variant} ${className}`} disabled={loading || p.disabled} {...p}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
}
export const LinkButton = ({ variant = 'primary', className = '', ...p }) => <Link className={`btn btn-${variant} ${className}`} {...p} />;
export function Field({ label, error, hint, children, required, htmlFor, className = '' }) {
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="req" aria-hidden>
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}
const STATUS_TONE = {
  DRAFT: 'muted',
  SUBMITTED: 'info',
  IN_REVIEW: 'info',
  INCOMPLETE: 'warn',
  COMPLETE: 'ok',
  DELIVERED: 'ok',
  ACTIVE: 'ok',
  COMING_SOON: 'muted',
  DISABLED: 'danger',
};
export const STATUS_LABEL = {
  DRAFT: t('Ноорог'),
  SUBMITTED: t('Илгээсэн'),
  IN_REVIEW: t('Бүрдэл хянаж байна'),
  INCOMPLETE: t('Нэмэлт материал шаардсан'),
  COMPLETE: t('Бүрдэл бүрэн'),
  DELIVERED: t('Эрх бүхий байгууллагад хүргүүлсэн'),
  ACTIVE: t('Идэвхтэй'),
  COMING_SOON: t('Тун удахгүй'),
  DISABLED: t('Хаалттай'),
};
export const Badge = ({ status, children, tone }) => (
  <span className={`badge badge-${tone || STATUS_TONE[status] || 'muted'}`}>{children || STATUS_LABEL[status] || status}</span>
);
export const Empty = ({ title, children, action }) => (
  <div className="empty">
    <div className="empty-icon" aria-hidden>
      ◌
    </div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
);
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  const msg =
    error.status === 403
      ? t('Энэ мэдээллийг үзэх эрхгүй байна.')
      : error.status === 404
        ? t('Мэдээлэл олдсонгүй. Холбоос буруу эсвэл устгагдсан байж болно.')
        : error.message;
  return (
    <div className="alert alert-danger" role="alert">
      <span>{msg}</span>
      {onRetry && error.status !== 403 && error.status !== 404 && (
        <Button variant="ghost" onClick={onRetry}>
          {t('Дахин оролдох')}
        </Button>
      )}
    </div>
  );
}
export const Alert = ({ tone = 'info', children, title }) => (
  <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <div>
      {title && <strong>{title}</strong>}
      {title && <br />}
      {children}
    </div>
  </div>
);
export const Loading = ({ label = t('Уншиж байна…') }) => (
  <div className="loading">
    <span className="spinner" /> {label}
  </div>
);
export const Skeleton = ({ rows = 3 }) => (
  <div className="skeleton-wrap" aria-busy="true" aria-label={t('Уншиж байна')}>
    {Array.from({
      length: rows,
    }).map((_, i) => (
      <div key={i} className="skeleton" />
    ))}
  </div>
);
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Хүртээмжтэй цонх (WCAG 2.1.2, 2.4.3): нээгдэхэд фокус дотогш, Tab цонхноос гарахгүй (trap),
 * Escape хаана, хаагдахад фокус өмнөх элемент рүүгээ буцна.
 */
export function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Нээсэн элементийг render-ийн үед барина: autoFocus нь effect-ээс өмнө фокусыг цонх руу шилжүүлдэг
  const prevRef = useRef(null);
  if (open && prevRef.current === null && typeof document !== 'undefined') prevRef.current = document.activeElement;
  if (!open) prevRef.current = null;
  useEffect(() => {
    if (!open) return undefined;
    const prev = prevRef.current;
    const box = ref.current;
    // autoFocus-тай элемент байвал түүнийг, үгүй бол биеийн эхний оролт/товч, эс бөгөөс “Хаах”
    if (box && !box.contains(document.activeElement)) {
      const first =
        box.querySelector('.modal-body ' + FOCUSABLE) || box.querySelector('.modal-foot ' + FOCUSABLE) || box.querySelector(FOCUSABLE);
      first?.focus();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !box.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !box.contains(document.activeElement))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Хаах')}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Confirm({ open, title, children, confirmLabel = t('Баталгаажуулах'), tone = 'primary', onConfirm, onClose, loading }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('Цуцлах')}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('‹ Өмнөх')}
      </Button>
      <span>
        {page} / {pages} {t('· нийт')} {total}
      </span>
      <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('Дараах ›')}
      </Button>
    </div>
  );
}

/* ───────── Toast мэдэгдэл ───────── */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = Math.random();
    setItems((x) => [
      ...x,
      {
        id,
        msg,
        tone,
      },
    ]);
    setTimeout(() => setItems((x) => x.filter((tv) => tv.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((tv2) => (
          <div key={tv2.id} className={`toast toast-${tv2.tone}`}>
            {tv2.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
export const DL = ({ items }) => (
  <dl className="dl">
    {items.filter(Boolean).map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v ?? '—'}</dd>
      </div>
    ))}
  </dl>
);
