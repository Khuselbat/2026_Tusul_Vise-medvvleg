// Зочны нэг урт нүүр хуудас (/): hero → ★ хариу шалгах → визийн мэдээлэл → хэрхэн → давуу тал/аюулгүй байдал → FAQ → холбоо барих.
// Хуучин тусдаа зочны хуудсуудын (Нүүр, /visas жагсаалт, /help) агуулгыг бүгдийг нь энд нэгтгэсэн — нэвтэрсэн хэрэглэгчид
// эдгээр хуудас хэвээр (App.jsx). Хэсэг бүр id-тай, scroll-spy нь onepage.js-ээр header-т дамжина.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Card, Button, LinkButton, Field, ErrorBox, Skeleton, Empty, useAsync } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import ResultCheck from '../../components/ResultCheck.jsx';
import { CountryCards, VisaCard } from '../../components/visaCards.jsx';
import { HelpSteps, HelpNotes, HelpContacts, HelpPrivacy } from './Help.jsx';
import { setActiveSection, scrollToSection, replaceHash } from '../../onepage.js';
import { t } from '../../i18n.js';

/** Хуудсан дээрх дарааллаар (scroll-spy) */
const SECTION_IDS = ['check', 'visas', 'how', 'security', 'faq', 'contact'];

const FAQ = () => [
  [
    t('Энэ систем виз олгодог уу?'),
    t('Үгүй. Систем нь материалын бүрдлийг зохион байгуулна; виз олгох шийдвэрийг эрх бүхий байгууллага гаргана.'),
  ],
  [
    t('“Цахимаар мэдүүлэх” гэж юу гэсэн үг вэ?'),
    t('“Цахимаар мэдүүлэх” нь операторт хүсэлт илгээх гэсэн үг; ЭСЯ-ны системд шууд бүртгэгдэхгүй.'),
  ],
  [t('Дотоод лавлах дугаар (KR-…) нь визийн дугаар мөн үү?'), t('Дотоод лавлах дугаар нь албан ёсны визийн дугаар биш.')],
  [t('“Бүрдэл бүрэн / дутуу” гэдэг нь юу вэ?'), t('Операторын “Бүрдэл бүрэн / дутуу” үнэлгээ нь виз олгох шийдвэр биш.')],
  [
    t('Визийнхээ хариуг хаанаас шалгах вэ?'),
    t('Албан ёсны хариуг Korea Visa Portal-аас шалгана. Портал дээр хариу олдохгүй бол татгалзсан гэж бүү дүгнэ.'),
  ],
  [t('Ямар файл хавсаргаж болох вэ?'), t('Материал бүрийг PDF, JPG, PNG хэлбэрээр хавсаргана (файл ≤10 MB, нийт ≤100 MB).')],
  [t('Паспортын эх хувийг яах вэ?'), t('Паспортын эх хувийг материал хүлээлгэн өгөхдөө авч очно.')],
  [
    t('Миний хувийн мэдээлэл хэр хамгаалагдсан бэ?'),
    t(
      'Паспортын дугаарыг сервер дээр шифрлэж хадгална. Хавсралтыг зөвхөн та болон хуваарилагдсан оператор нээнэ; админ эрх таны файлыг үзэх эрх биш. Порталын нууц үгийг энэ системд хэзээ ч оруулахгүй.',
    ),
  ],
];

const BENEFITS = () => [
  ['shield', t('Паспорт шифрлэгдсэн'), t('Паспортын дугаарыг AES-256-GCM-ээр шифрлэж хадгална.')],
  ['user', t('Зөвхөн эрх бүхий хүн'), t('Хавсралтыг зөвхөн та болон хуваарилагдсан оператор нээнэ; админ эрх таны файлыг үзэх эрх биш.')],
  ['upload', t('Файлын шалгалт'), t('Зөвхөн PDF, JPG, PNG — файлын агуулгаар нь шалгана; файл ≤10 MB, нийт ≤100 MB.')],
  ['archive', t('Нэг дор архив'), t('Өмнөх мэдүүлэг, бүрдлийн үнэлгээгээ хэзээ ч нээж харна. Илгээсэн мэдүүлэг засагдахгүй.')],
  ['file', t('Үйлдлийн бүртгэл'), t('Мэдээлэл өөрчлөх үйлдэл бүр бүртгэгдэнэ.')],
  ['login', t('Хоёр шатлалт нэвтрэлт'), t('Оператор, админ хоёр шатлалт баталгаажуулалтаар (2FA) нэвтэрнэ.')],
];

// Хэсэг бүр дэлгэцийн бүтэн өргөнтэй зурвас (дэвсгэр, хүрээ ирмэг хүртэл), агуулга нь .wrap container дотор
function Section({ id, title, lead, eyebrow, className = '', children }) {
  return (
    <section id={id} className={`op-section op-band ${className}`} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="wrap reveal">
        <header className="op-head">
          {eyebrow}
          <h2 id={`${id}-title`}>{title}</h2>
          {lead && <p className="op-lead">{lead}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}

export default function OnePage() {
  const loc = useLocation();
  const [sp] = useSearchParams();
  const [country, setCountry] = useState(sp.get('country') || '');
  const [q, setQ] = useState(sp.get('q') || '');
  const [text, setText] = useState(q);
  const countries = useAsync(() => api.get('/api/countries'), []);
  const allVisas = useAsync(() => api.get('/api/visas'), []);
  const visas = useAsync(() => (country || q ? api.get(`/api/visas${qs({ country, q })}`) : Promise.resolve(null)), [country, q]);
  const list = country || q ? visas : allVisas;
  const rootRef = useRef(null);

  // /#faq гэх мэт hash-тай ирэхэд (эсвэл өөр хуудаснаас цэс дарахад) тухайн хэсэг рүү очно; өгөгдөл ачаалсны дараа дахин тааруулна
  const hash = loc.hash.slice(1);
  useEffect(() => {
    if (!hash) return undefined;
    const raf = requestAnimationFrame(() => scrollToSection(hash, { smooth: false }));
    return () => cancelAnimationFrame(raf);
  }, [hash, loc.key]);
  const settled = !countries.loading && !allVisas.loading;
  useEffect(() => {
    if (settled && hash && window.scrollY > 0) scrollToSection(hash, { smooth: false });
    // зөвхөн анх ачаалж дуусахад
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  // Scroll-spy: header-ийн доорх ~30% шугамыг давсан сүүлийн хэсэг идэвхтэй; хамгийн доор хүрвэл сүүлийнх
  useEffect(() => {
    let raf = 0;
    let first = true;
    const compute = () => {
      raf = 0;
      const line = 72 + window.innerHeight * 0.3;
      let cur = '';
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = SECTION_IDS.at(-1);
      setActiveSection(cur);
      if (!first) replaceHash(cur);
      first = false;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      setActiveSection('');
    };
  }, []);

  // Гүйлгэхэд хэсгүүд зөөлөн гарч ирнэ (зөвхөн transform — D-78; prefers-reduced-motion үед CSS анимацгүй)
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    root.classList.add('reveal-on');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Хуудсан доторх "#…" холбоосыг зөөлөн гүйлгэж, фокусыг тухайн хэсэгт шилжүүлнэ
  const onClick = (e) => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = a.getAttribute('href').slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    scrollToSection(id);
    replaceHash(id);
    document.getElementById(id).focus({ preventScroll: true });
  };

  const pickCountry = (iso) => {
    setCountry(iso);
    scrollToSection('visa-list');
  };
  const clearFilters = () => {
    setCountry('');
    setQ('');
    setText('');
  };

  return (
    // Холбоосын click-ийг дамжуулан барина (гарын Enter нь холбоос дээр click үүсгэдэг тул тусдаа keydown хэрэггүй)
    <div className="op" ref={rootRef} onClick={onClick}>
      <section className="op-band op-hero-band" aria-labelledby="op-title">
        <div className="wrap op-hero">
          <div className="hero-text">
            <span className="eyebrow">
              <Icon name="shield" size={16} />
              {t('Цахим виз')}
            </span>
            <h1 id="op-title">{t('Визийн мэдээлэл нэг дор')}</h1>
            <p>{t('Шаардлагаа уншиж, материалаа бүрдүүлээд мэдүүлгээ илгээнэ.')}</p>
            <div className="row-actions">
              <a className="btn btn-primary" href="#check">
                <Icon name="check" size={18} />
                {t('Хариугаа шалгах')}
              </a>
              <LinkButton variant="ghost" to="/register">
                {t('Бүртгүүлэх')}
              </LinkButton>
              <a className="btn btn-link hero-more" href="#visas">
                {t('Визийн мэдээлэл үзэх')}
                <Icon name="arrow" size={18} />
              </a>
            </div>
          </div>
          <svg className="hero-art" viewBox="0 0 220 180" aria-hidden="true" focusable="false">
            <rect x="38" y="18" width="120" height="150" rx="14" className="ha-back" />
            <rect x="62" y="8" width="120" height="150" rx="14" className="ha-card" />
            <circle cx="122" cy="58" r="22" className="ha-accent" />
            <path d="M111 58l7 7 14-14" className="ha-check" />
            <rect x="82" y="96" width="80" height="8" rx="4" className="ha-line" />
            <rect x="82" y="114" width="60" height="8" rx="4" className="ha-line" />
            <rect x="82" y="132" width="70" height="8" rx="4" className="ha-line" />
            <circle cx="186" cy="150" r="18" className="ha-dot" />
          </svg>
        </div>
      </section>

      <Section
        id="check"
        className="op-check"
        eyebrow={
          <span className="eyebrow eyebrow-strong">
            <Icon name="check" size={16} />
            {t('Гол үйлчилгээ')}
          </span>
        }
        title={t('Визийн хариу шалгах')}
        lead={t(
          'Визийнхээ хариуг эндээс шалгана уу. Мэдээллээ бэлдээд албан ёсны порталаар шалгана — хариуг эрх бүхий байгууллага гаргана.',
        )}
      >
        <ErrorBox error={countries.error} onRetry={countries.reload} />
        <ResultCheck countries={countries.data?.countries || []} visas={allVisas.data?.visas || []} loading={allVisas.loading} />
      </Section>

      <Section id="visas" title={t('Визийн мэдээлэл')} lead={t('Ангилал, бүрдүүлэх материал, эх сурвалж, шалгасан огноо')}>
        <ErrorBox error={countries.error} onRetry={countries.reload} />
        {countries.loading ? (
          <Skeleton rows={2} />
        ) : (
          <CountryCards countries={countries.data?.countries || []} onSelect={pickCountry} gridClass="grid-auto" />
        )}
        <h3 id="visa-list" className="op-sub">
          {t('Визийн мэдээлэл хайх')}
        </h3>
        <form
          className="filters"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(text.trim());
          }}
        >
          <Field label={t('Улс')} htmlFor="op-c">
            <select id="op-c" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t('Бүгд')}</option>
              {countries.data?.countries.map((c) => (
                <option key={c.id} value={c.iso}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Нэр эсвэл код')} htmlFor="op-q" className="grow">
            <input id="op-q" placeholder={t('ж: C-3-9, аялал')} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Button type="submit">{t('Хайх')}</Button>
        </form>
        <ErrorBox error={list.error} onRetry={list.reload} />
        {list.loading ? (
          <Skeleton rows={3} />
        ) : list.data?.visas.length === 0 ? (
          <Empty
            title={t('Үр дүн олдсонгүй')}
            action={
              <Button variant="ghost" onClick={clearFilters}>
                {t('Хайлтаа өөрчлөх')}
              </Button>
            }
          >
            {t('Өөр нэр, код эсвэл улсаар хайна уу.')}
          </Empty>
        ) : (
          <div className="grid grid-auto">
            {list.data?.visas.map((v) => (
              <VisaCard key={v.versionId} v={v} />
            ))}
          </div>
        )}
      </Section>

      <Section id="how" className="op-alt" title={t('Хэрхэн ажилладаг')} lead={t('Системийг хэрхэн ашиглах, юуг хариуцдаг вэ')}>
        <ol className="features">
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="book" size={22} />
            </span>
            <strong>{t('1. Мэдээлэл унших')}</strong>
            <p className="muted small">{t('Ангилал бүрийн материал, эх сурвалж, шалгасан огноог харна.')}</p>
          </li>
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="upload" size={22} />
            </span>
            <strong>{t('2. Анкет, материал илгээх')}</strong>
            <p className="muted small">{t('PDF, JPG, PNG файлаа хавсаргаад нэг дор илгээнэ. Дотоод лавлах дугаар олгоно.')}</p>
          </li>
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="archive" size={22} />
            </span>
            <strong>{t('3. Архив, явц хянах')}</strong>
            <p className="muted small">{t('Өмнөх мэдүүлэг, бүрдлийн үнэлгээгээ хэзээ ч нээж харна.')}</p>
          </li>
        </ol>
        <Card className="prose">
          <HelpSteps visasLink="#visas" level={3} />
        </Card>
        <p className="small muted mb0">{t('Систем виз олгох шийдвэр гаргахгүй. Албан ёсны хариуг Korea Visa Portal-аас шалгана.')}</p>
      </Section>

      <Section id="security" title={t('Давуу тал ба аюулгүй байдал')} lead={t('Таны мэдээллийг хэрхэн хамгаалдаг вэ')}>
        <ul className="benefits">
          {BENEFITS().map(([icon, title, body]) => (
            <li key={title}>
              <span className="feature-icon" aria-hidden>
                <Icon name={icon} size={22} />
              </span>
              <h3>{title}</h3>
              <p className="muted small">{body}</p>
            </li>
          ))}
        </ul>
        <Card className="prose" id="privacy">
          <HelpPrivacy level={3} />
        </Card>
      </Section>

      <Section id="faq" className="op-alt" title={t('Түгээмэл асуулт')}>
        <div className="faq">
          {FAQ().map(([qq, a]) => (
            <details key={qq}>
              <summary>
                <span>{qq}</span>
                <Icon name="plus" size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="contact" title={t('Тусламж ба холбоо барих')} lead={t('Мэдээллийн заавар')}>
        <div className="grid grid-auto">
          <Card className="prose">
            <HelpContacts level={3} />
          </Card>
          <Card className="prose" id="terms">
            <HelpNotes level={3} />
          </Card>
        </div>
        <p className="small muted mb0">
          {t('Цахим виз · Энэхүү систем нь материалын бүрдлийг зохион байгуулна; виз олгох шийдвэрийг эрх бүхий байгууллага гаргана.')}
        </p>
      </Section>
    </div>
  );
}
