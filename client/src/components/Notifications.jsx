// Үе 2 — систем доторх мэдэгдэл (хонх) ба имэйл баталгаажуулалтын сануулга.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Button, fmtDateTime, useToast } from './ui.jsx';

const POLL_MS = 60000;

export function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const ref = useRef(null);

  const load = useCallback(() => {
    api
      .get('/api/notifications?limit=10')
      .then(setData)
      .catch(() => {}); // хонх уншигдахгүй бол хуудсыг саатуулахгүй
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, loc.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function openItem(n) {
    setOpen(false);
    if (!n.readAt) await api.post(`/api/notifications/${n.id}/read`).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await api.post('/api/notifications/read-all').catch(() => {});
    load();
  }

  return (
    <div className="bell" ref={ref}>
      <button
        className="icon-btn"
        aria-label={`Мэдэгдэл${data.unread ? ` (${data.unread} уншаагүй)` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        {data.unread > 0 && <span className="bell-count">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label="Мэдэгдлүүд">
          <div className="between bell-head">
            <strong>Мэдэгдэл</strong>
            {data.unread > 0 && (
              <button className="btn-link" onClick={readAll}>
                Бүгдийг уншсан
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="muted small" style={{ padding: '8px 12px' }}>
              Мэдэгдэл алга.
            </p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className={n.readAt ? '' : 'unread'}>
                  <button onClick={() => openItem(n)}>
                    <strong>{n.title}</strong>
                    <span className="small">{n.body}</span>
                    <span className="small muted">{fmtDateTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Мэдүүлэгчийн имэйл баталгаажаагүй бол сануулга + дахин илгээх. */
export function EmailVerifyBanner({ user }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user || user.role !== 'APPLICANT' || user.emailVerified) return null;
  async function resend() {
    setBusy(true);
    try {
      await api.post('/api/auth/verify-email/resend');
      toast('Баталгаажуулах холбоос илгээгдлээ. Имэйлээ шалгана уу.');
    } catch (ex) {
      toast(ex.message, 'danger');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="alert alert-warn verify-banner" role="status">
      <span>
        Имэйл хаягаа (<strong>{user.email}</strong>) баталгаажуулаагүй байна. Мэдүүлэг илгээх, мэдэгдэл авахын тулд имэйлээр ирсэн холбоосыг
        нээнэ үү.
      </span>
      <Button variant="ghost" className="btn-sm" loading={busy} onClick={resend}>
        Дахин илгээх
      </Button>
    </div>
  );
}

/** Үе 4: сүлжээ тасарвал анхааруулга (өөрчлөлт хадгалагдахгүй байж болзошгүй) */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="alert alert-danger" role="alert">
      Интернэт холболт тасарсан байна. Холболт сэргэх хүртэл өөрчлөлт хадгалагдахгүй — хуудсаа хаалгүй хүлээнэ үү.
    </div>
  );
}
