import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_LABEL, HOME_BY_ROLE } from '../auth.jsx';
import { Modal, Button } from './ui.jsx';
import { NotificationBell, EmailVerifyBanner, OfflineBanner } from './Notifications.jsx';

// Хүснэгт 40: эрх тус бүрийн үндсэн цэс
const MENUS = {
  GUEST: [
    ['/', 'Нүүр', true],
    ['/visas', 'Визийн мэдээлэл'],
    ['/login', 'Нэвтрэх'],
    ['/register', 'Бүртгүүлэх'],
  ],
  APPLICANT: [
    ['/app', 'Хянах самбар', true],
    ['/app/new', 'Шинэ мэдүүлэг'],
    ['/app/applications', 'Миний архив'],
    ['/app/imports', 'Өмнөх мэдүүлэг'],
    ['/app/official-result', 'Үр дүн шалгах'],
    ['/visas', 'Визийн мэдээлэл'],
    ['/app/profile', 'Профайл'],
  ],
  OPERATOR: [
    ['/operator', 'Ажлын жагсаалт', true],
    ['/operator/history', 'Үнэлгээний түүх'],
    ['/operator/profile', 'Профайл'],
  ],
  ADMIN: [
    ['/admin', 'Самбар', true],
    ['/admin/countries', 'Улс'],
    ['/admin/visa-types', 'Визийн төрөл'],
    ['/admin/users', 'Хэрэглэгчид'],
    ['/admin/assignments', 'Хуваарилалт'],
    ['/admin/stats', 'Статистик'],
    ['/admin/audit', 'Бүртгэл'],
    ['/admin/deletion-requests', 'Устгах хүсэлт'],
    ['/admin/profile', 'Профайл'],
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
        Үндсэн агуулга руу шилжих
      </a>
      <header className="topbar">
        <button className="icon-btn burger" aria-label="Цэс" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
        <Link to={user ? HOME_BY_ROLE[user.role] : '/'} className="brand">
          <span className="logo" aria-hidden>
            V
          </span>
          <span>ЦАХИМ ВИЗ</span>
        </Link>
        <div className="top-right">
          <span className="role-label" title={user?.email}>
            {user ? `${ROLE_LABEL[user.role]} · ${user.name}` : 'Зочин'}
          </span>
          {user && <NotificationBell />}
          {user ? (
            <button className="link-strong" onClick={logout}>
              Гарах
            </button>
          ) : (
            <Link className="link-strong" to="/login">
              Нэвтрэх
            </Link>
          )}
        </div>
      </header>
      <div className="body">
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <div className="side-title">ҮНДСЭН ЦЭС</div>
          <nav>
            {menu.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="side-help">
            <div>Тусламж хэрэгтэй юу?</div>
            <Link to="/help">Мэдээллийн заавар</Link>
          </div>
        </aside>
        {open && <div className="side-backdrop" onClick={() => setOpen(false)} />}
        <main id="main" className="main">
          <OfflineBanner />
          <EmailVerifyBanner user={user} />
          <Outlet />
          <footer className="site-foot">
            Цахим виз · Энэхүү систем нь материалын бүрдлийг зохион байгуулна; виз олгох шийдвэрийг эрх бүхий байгууллага гаргана.
          </footer>
        </main>
      </div>
      <Modal
        open={expired}
        title="Сесс дууссан"
        onClose={() => setExpired(false)}
        footer={
          <Button
            onClick={() => {
              setExpired(false);
              navigate(`/login?next=${encodeURIComponent(loc.pathname)}`);
            }}
          >
            Дахин нэвтрэх
          </Button>
        }
      >
        Нэвтрэх хугацаа дууссан эсвэл эрх өөрчлөгдсөн байна. Дахин нэвтэрнэ үү. Илгээгээгүй мэдээлэл хадгалагдаагүй байж болно.
      </Modal>
    </div>
  );
}
