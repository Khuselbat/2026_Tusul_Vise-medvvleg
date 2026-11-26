// Зочны (нэвтрээгүй) бүтэц: тогтмол дээд header (хэсэг рүү үсрэх цэс, хэл, горим, Нэвтрэх/Бүртгүүлэх),
// тогтмол нимгэн footer, "Дээш буцах" товч. Sidebar-гүй, агуулга бүтэн өргөнөөр голлосон.
// Нэвтэрсэн хэрэглэгчийн shell (Layout.jsx) өөрчлөгдөөгүй.
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { OfflineBanner } from './Notifications.jsx';
import Icon from './Icon.jsx';
import { currentTheme, setTheme } from '../theme.js';
import { t, lang, LANGS, setLanguage } from '../i18n.js';
import { NAV_SECTIONS, useActiveSection, scrollToSection, replaceHash, setActiveSection } from '../onepage.js';

export default function GuestShell() {
  const loc = useLocation();
  const navigate = useNavigate();
  const onHome = loc.pathname === '/';
  const activeSection = useActiveSection();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [theme, setThemeState] = useState(currentTheme);
  const headerRef = useRef(null);
  const burgerRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setShowTop(window.scrollY > 600);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);
  // Mobile цэс: Esc → хааж фокусыг товч руу буцаана; гадна дарвал хаана
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        burgerRef.current?.focus();
      }
    };
    const onDown = (e) => {
      if (!headerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  /** Хэсэг рүү: нүүрэн дээр бол шууд гүйлгэнэ, бусад хуудаснаас /#id руу шилжинэ (OnePage hash-аар гүйлгэнэ) */
  const go = (e, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setOpen(false);
    if (onHome && scrollToSection(id)) {
      replaceHash(id);
      if (id) setActiveSection(id);
      const target = id ? document.getElementById(id) : document.getElementById('main');
      target?.focus({ preventScroll: true });
    } else navigate(id ? `/#${id}` : '/');
  };

  return (
    <div className="g-shell">
      <a className="skip" href="#main">
        {t('Үндсэн агуулга руу шилжих')}
      </a>
      <header ref={headerRef} className={`g-header ${scrolled ? 'scrolled' : ''} ${open ? 'menu-open' : ''}`}>
        <div className="g-inner">
          <a href="/" className="brand" onClick={(e) => go(e, '')}>
            <span className="logo" aria-hidden>
              V
            </span>
            <span>{t('ЦАХИМ ВИЗ')}</span>
          </a>
          <button
            ref={burgerRef}
            type="button"
            className="icon-btn g-burger"
            aria-label={t('Цэс')}
            aria-expanded={open}
            aria-controls="guest-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
          <div id="guest-menu" className={`g-menu ${open ? 'open' : ''}`}>
            <nav className="g-nav" aria-label={t('Хуудасны хэсгүүд')}>
              <ul>
                {NAV_SECTIONS.map(([id, label, icon]) => (
                  <li key={id}>
                    <a
                      href={`/#${id}`}
                      className={`g-link ${onHome && activeSection === id ? 'active' : ''}`}
                      aria-current={onHome && activeSection === id ? 'location' : undefined}
                      onClick={(e) => go(e, id)}
                    >
                      <Icon name={icon} size={18} />
                      <span>{label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="g-actions">
              <select className="lang-select" aria-label="Хэл / Language" value={lang} onChange={(e) => setLanguage(e.target.value)}>
                {Object.entries(LANGS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
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
            </div>
          </div>
          {/* Нэвтрэх/Бүртгүүлэх нь mobile-д ч header-т харагдана (цэсэнд нуугдахгүй) */}
          <div className="g-auth">
            <Link className="link-strong g-login" to="/login">
              {t('Нэвтрэх')}
            </Link>
            <Link className="btn btn-primary btn-sm g-register" to="/register">
              {t('Бүртгүүлэх')}
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="g-main" tabIndex={-1}>
        <OfflineBanner />
        <Outlet />
      </main>
      {showTop && (
        <button type="button" className="icon-btn to-top" aria-label={t('Дээш буцах')} title={t('Дээш буцах')} onClick={(e) => go(e, '')}>
          <Icon name="arrow" size={20} />
        </button>
      )}
      <footer className="g-footer">
        <div className="g-inner">
          <span>{t('© 2026 Цахим виз · Сургалтын төсөл')}</span>
          <nav className="g-foot-links" aria-label={t('Footer холбоос')}>
            <a href="/#privacy" onClick={(e) => go(e, 'privacy')}>
              {t('Нууцлал')}
            </a>
            <a href="/#terms" onClick={(e) => go(e, 'terms')}>
              {t('Нөхцөл')}
            </a>
            <a href="/#contact" onClick={(e) => go(e, 'contact')}>
              {t('Холбоо барих')}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
