import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL, HOME_BY_ROLE } from '../auth.jsx';
import { Modal, Button } from './ui.jsx';
import { NotificationBell, EmailVerifyBanner, OfflineBanner } from './Notifications.jsx';
import Icon from './Icon.jsx';
import { currentTheme, setTheme } from '../theme.js';

// Хүснэгт 40: эрх тус бүрийн үндсэн цэс
import { t, lang, LANGS, setLanguage } from '../i18n.js';
const MENUS = {
  GUEST: [
    ['/', t('Нүүр'), true, 'home'],
    ['/visas', t('Визийн мэдээлэл'), false, 'book'],
    ['/login', t('Нэвтрэх'), false, 'login'],
    ['/register', t('Бүртгүүлэх'), false, 'userPlus'],
  ],
  APPLICANT: [
    ['/app', t('Хянах самбар'), true, 'grid'],
    ['/app/new', t('Шинэ мэдүүлэг'), false, 'plus'],
    ['/app/applications', t('Миний архив'), false, 'archive'],
    ['/app/imports', t('Өмнөх мэдүүлэг'), false, 'history'],
    ['/app/documents', t('Бичиг баримтын сан'), false, 'folder'],
    ['/app/official-result', t('Үр дүн шалгах'), false, 'check'],
    ['/visas', t('Визийн мэдээлэл'), false, 'book'],
    ['/app/profile', t('Профайл'), false, 'user'],
  ],
  OPERATOR: [
    ['/operator', t('Ажлын жагсаалт'), true, 'list'],
    ['/operator/history', t('Үнэлгээний түүх'), false, 'history'],
    ['/operator/profile', t('Профайл'), false, 'user'],
  ],
  ADMIN: [
    ['/admin', t('Самбар'), true, 'grid'],
    ['/admin/countries', t('Улс'), false, 'flag'],
    ['/admin/visa-types', t('Визийн төрөл'), false, 'tag'],
    ['/admin/users', t('Хэрэглэгчид'), false, 'users'],
    ['/admin/assignments', t('Хуваарилалт'), false, 'shuffle'],
    ['/admin/stats', t('Статистик'), false, 'chart'],
    ['/admin/audit', t('Бүртгэл'), false, 'file'],
    ['/admin/deletion-requests', t('Устгах хүсэлт'), false, 'trash'],
    ['/admin/profile', t('Профайл'), false, 'user'],
  ],
};
export default function Layout() {
  const { user, logout, expired, setExpired } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const menu = MENUS[user?.role || 'GUEST'];
  const [theme, setThemeState] = useState(currentTheme);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  return (
    <div className="shell">
      <a className="skip" href="#main">
        {t('Үндсэн агуулга руу шилжих')}
      </a>
      <header className="topbar">
        <button className="icon-btn burger" aria-label={t('Цэс')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'close' : 'menu'} size={22} />
        </button>
        <Link to={user ? HOME_BY_ROLE[user.role] : '/'} className="brand">
          <span className="logo" aria-hidden>
            V
          </span>
          <span>{t('ЦАХИМ ВИЗ')}</span>
        </Link>
        <div className="top-right">
          <span className="user-chip" title={user?.email}>
            <span className="avatar" aria-hidden>
              {user ? (user.name || '?').trim().charAt(0).toUpperCase() : <Icon name="user" size={16} />}
            </span>
            <span className="role-label">{user ? `${ROLE_LABEL[user.role]} · ${user.name}` : t('Зочин')}</span>
          </span>
          <button
            type="button"
            className="icon-btn theme-toggle"
            aria-label={t('Харанхуй горим')}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? t('Гэрэлтэй горим руу шилжих') : t('Харанхуй горим руу шилжих')}
            onClick={toggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
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
            {menu.map(([to, label, end, icon]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
                <Icon name={icon} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="side-help">
            <Icon name="help" size={22} />
            <div>
              <div>{t('Тусламж хэрэгтэй юу?')}</div>
              <Link to="/help">{t('Мэдээллийн заавар')}</Link>
            </div>
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
