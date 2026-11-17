import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL, HOME_BY_ROLE } from '../auth.jsx';
import { Modal, Button } from './ui.jsx';
import { NotificationBell, EmailVerifyBanner, OfflineBanner } from './Notifications.jsx';

// Хүснэгт 40: эрх тус бүрийн үндсэн цэс
import { t, lang, LANGS, setLanguage } from '../i18n.js';
const MENUS = {
  GUEST: [
    ['/', t('Нүүр'), true],
    ['/visas', t('Визийн мэдээлэл')],
    ['/login', t('Нэвтрэх')],
    ['/register', t('Бүртгүүлэх')],
  ],
  APPLICANT: [
    ['/app', t('Хянах самбар'), true],
    ['/app/new', t('Шинэ мэдүүлэг')],
    ['/app/applications', t('Миний архив')],
    ['/app/imports', t('Өмнөх мэдүүлэг')],
    ['/app/official-result', t('Үр дүн шалгах')],
    ['/visas', t('Визийн мэдээлэл')],
    ['/app/profile', t('Профайл')],
  ],
  OPERATOR: [
    ['/operator', t('Ажлын жагсаалт'), true],
    ['/operator/history', t('Үнэлгээний түүх')],
    ['/operator/profile', t('Профайл')],
  ],
  ADMIN: [
    ['/admin', t('Самбар'), true],
    ['/admin/countries', t('Улс')],
    ['/admin/visa-types', t('Визийн төрөл')],
    ['/admin/users', t('Хэрэглэгчид')],
    ['/admin/assignments', t('Хуваарилалт')],
    ['/admin/stats', t('Статистик')],
    ['/admin/audit', t('Бүртгэл')],
    ['/admin/deletion-requests', t('Устгах хүсэлт')],
    ['/admin/profile', t('Профайл')],
  ],
};
export default function Layout() {
  const { user, logout, expired, setExpired } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const menu = MENUS[user?.role || 'GUEST'];
  return (
    <div className="shell">
      <a className="skip" href="#main">
        {t('Үндсэн агуулга руу шилжих')}
      </a>
      <header className="topbar">
        <button className="icon-btn burger" aria-label={t('Цэс')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
        <Link to={user ? HOME_BY_ROLE[user.role] : '/'} className="brand">
          <span className="logo" aria-hidden>
            V
          </span>
          <span>{t('ЦАХИМ ВИЗ')}</span>
        </Link>
        <div className="top-right">
          <span className="role-label" title={user?.email}>
            {user ? `${ROLE_LABEL[user.role]} · ${user.name}` : t('Зочин')}
          </span>
          <select className="lang-select" aria-label="Хэл / Language" value={lang} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(LANGS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {user && <NotificationBell />}
          {user ? (
            <button className="link-strong" onClick={logout}>
              {t('Гарах')}
            </button>
          ) : (
            <Link className="link-strong" to="/login">
              {t('Нэвтрэх')}
            </Link>
          )}
        </div>
      </header>
      <div className="body">
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <div className="side-title">{t('ҮНДСЭН ЦЭС')}</div>
          <nav>
            {menu.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="side-help">
            <div>{t('Тусламж хэрэгтэй юу?')}</div>
            <Link to="/help">{t('Мэдээллийн заавар')}</Link>
          </div>
        </aside>
        {open && <div className="side-backdrop" onClick={() => setOpen(false)} />}
        <main id="main" className="main">
          <OfflineBanner />
          <EmailVerifyBanner user={user} />
          <Outlet />
          <footer className="site-foot">
            {t('Цахим виз · Энэхүү систем нь материалын бүрдлийг зохион байгуулна; виз олгох шийдвэрийг эрх бүхий байгууллага гаргана.')}
          </footer>
        </main>
      </div>
      <Modal
        open={expired}
        title={t('Сесс дууссан')}
        onClose={() => setExpired(false)}
        footer={
          <Button
            onClick={() => {
              setExpired(false);
              navigate(`/login?next=${encodeURIComponent(loc.pathname)}`);
            }}
          >
            {t('Дахин нэвтрэх')}
          </Button>
        }
      >
        {t('Нэвтрэх хугацаа дууссан эсвэл эрх өөрчлөгдсөн байна. Дахин нэвтэрнэ үү. Илгээгээгүй мэдээлэл хадгалагдаагүй байж болно.')}
      </Modal>
    </div>
  );
}
