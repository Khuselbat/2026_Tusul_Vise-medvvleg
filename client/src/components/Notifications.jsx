// Үе 2 — систем доторх мэдэгдэл (хонх) ба имэйл баталгаажуулалтын сануулга.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Button, fmtDateTime, useToast } from './ui.jsx';
import { t } from '../i18n.js';
const POLL_MS = 60000;

// Мэдэгдлийн текстийг төрлөөр нь клиент талд үүсгэнэ (сонгосон хэлээр). Сервер ижил текстийг монголоор илгээдэг.
const KIND_TEXT = {
  APP_SUBMITTED: () => [
    t('Мэдүүлэг хүлээн авлаа'),
    (r) => t('Таны {{v0}} дугаартай мэдүүлэг архивлагдаж, бүрдлийн хяналтад шилжлээ.', { v0: r }),
  ],
  APP_ASSIGNED: () => [t('Танд мэдүүлэг хуваарилагдлаа'), (r) => t('{{v0}} дугаартай мэдүүлгийн бүрдлийг шалгана уу.', { v0: r })],
  REVIEW_INCOMPLETE: () => [
    t('Нэмэлт материал шаардлагатай'),
    (r) =>
      t('{{v0}} мэдүүлэгт оператор нэмэлт материал шаардлаа. Дэлгэрэнгүйг системд нэвтэрч үзнэ үү. Энэ нь визийн шийдвэр биш.', { v0: r }),
  ],
  REVIEW_COMPLETE: () => [
    t('Бүрдэл бүрэн'),
    (r) => t('{{v0}} мэдүүлгийн материалын бүрдэл бүрэн гэж үнэлэгдлээ. Энэ нь визийн шийдвэр биш.', { v0: r }),
  ],
  SUPPLEMENT_SUBMITTED: () => [t('Нэмэлт материал ирлээ'), (r) => t('{{v0}} мэдүүлэгт мэдүүлэгч нэмэлт материал илгээлээ.', { v0: r })],
  DELETION_REQUESTED: () => [
    t('Бүртгэл устгах хүсэлт ирлээ'),
    (r) => t('{{v0}} — мэдүүлэгч бүртгэлээ устгахыг хүссэн. Шийдвэрлэнэ үү.', { v0: r }),
  ],
  HANDOVER_RECORDED: () => [
    t('Эрх бүхий байгууллагад хүргүүлсэн'),
    (r) => t('{{v0}} мэдүүлгийн материалыг хүргүүлсэн. Албан ёсны хариуг Korea Visa Portal-аас шалгана уу.', { v0: r }),
  ],
};
const textOf = (n) => {
  const k = KIND_TEXT[n.kind];
  if (!k) return [n.title, n.body];
  const [title, body] = k();
  return [title, n.ref ? body(n.ref) : ''];
};
export function NotificationBell() {
  const [data, setData] = useState({
    unread: 0,
    items: [],
  });
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
    const tv = setInterval(load, POLL_MS);
    return () => clearInterval(tv);
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
        aria-label={t('Мэдэгдэл{{v0}}', {
          // Харагдах тоо (“5”, “9+”) нэрэнд яг ижилээр орно
          v0: data.unread ? `: ${data.unread > 9 ? '9+' : data.unread} ${t('уншаагүй')}` : '', // хаалтгүй — “5” тусдаа үг
        })}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Emoji биш SVG: харагдах текст нь зөвхөн тоо байх тул нэр (aria-label)-д бүрэн багтана (WCAG 2.5.3) */}
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"
          />
        </svg>
        {/* Тоо нь aria-label-д бий; харагдах тоог дэлгэц уншигчаас нууна (WCAG 2.5.3 label-in-name) */}
        {data.unread > 0 && (
          <span className="bell-count" aria-hidden="true">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label={t('Мэдэгдлүүд')}>
          <div className="between bell-head">
            <strong>{t('Мэдэгдэл')}</strong>
            {data.unread > 0 && (
              <button className="btn-link" onClick={readAll}>
                {t('Бүгдийг уншсан')}
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p
              className="muted small"
              style={{
                padding: '8px 12px',
              }}
            >
              {t('Мэдэгдэл алга.')}
            </p>
          ) : (
            <ul>
              {data.items.map((n) => (
                <li key={n.id} className={n.readAt ? '' : 'unread'}>
                  <button onClick={() => openItem(n)}>
                    <strong>{textOf(n)[0]}</strong>
                    <span className="small">{textOf(n)[1]}</span>
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
  const [wait, setWait] = useState(0); // “Дахин илгээх”-ийн 60 секундын хүлээлт (сервер ч шалгана)
  const [error, setError] = useState('');
  useEffect(() => {
    if (wait <= 0) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);
  if (!user || user.role !== 'APPLICANT' || user.emailVerified) return null;
  async function resend() {
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/api/auth/verify-email/resend');
      if (r.alreadyVerified) toast(t('Имэйл аль хэдийн баталгаажсан байна.'));
      else toast(t('Баталгаажуулах холбоос илгээгдлээ. Имэйлээ (Spam хавтсыг оролцуулан) шалгана уу.'));
      setWait(r.cooldownSec || 60);
    } catch (ex) {
      if (ex.retryAfter) setWait(ex.retryAfter);
      // Илгээж чадаагүй шалтгааныг тод харуулна (өмнө нь чимээгүй алдаж байв)
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="alert alert-warn verify-banner" role="status">
      <span>
        {t('Имэйл хаягаа (')}
        <strong>{user.email}</strong>
        {t(') баталгаажуулаагүй байна. Мэдүүлэг илгээх, мэдэгдэл авахын тулд имэйлээр ирсэн холбоосыг нээнэ үү.')}
        {error && (
          <span className="verify-error" role="alert">
            <br />
            {error}
          </span>
        )}
      </span>
      <Button variant="ghost" className="btn-sm" loading={busy} disabled={wait > 0} onClick={resend}>
        {wait > 0 ? t('Дахин илгээх ({{v0}} сек)', { v0: wait }) : t('Дахин илгээх')}
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
      {t('Интернэт холболт тасарсан байна. Холболт сэргэх хүртэл өөрчлөлт хадгалагдахгүй — хуудсаа хаалгүй хүлээнэ үү.')}
    </div>
  );
}
