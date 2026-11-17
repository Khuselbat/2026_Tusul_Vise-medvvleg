// Үе 4 — i18n (i18next). Монгол (үндсэн) + англи.
// Түлхүүр нь монгол текст өөрөө (gettext маяг): орчуулга байхгүй бол монголоор харагдана — UI хэзээ ч хоосон түлхүүр харуулахгүй.
// Хэл солиход хуудсыг дахин ачаална — модулийн түвшний тогтмолууд (цэс, төлөвийн нэр) ч шинэ хэлээр үнэлэгдэнэ (D-43).
import i18next from 'i18next';
import en from './locales/en.json';

export const LANGS = { mn: 'Монгол', en: 'English' };
const STORAGE = 'civiz.lang';

function initialLang() {
  try {
    const s = window.localStorage.getItem(STORAGE);
    if (s && Object.hasOwn(LANGS, s)) return s;
  } catch {
    /* хувийн горим г.м. — анхдагч */
  }
  return 'mn';
}

export const lang = typeof window === 'undefined' ? 'mn' : initialLang();

i18next.init({
  lng: lang,
  fallbackLng: false,
  resources: { mn: { translation: {} }, en: { translation: en } },
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React өөрөө escape хийнэ
  initAsync: false,
});

if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** Орчуулах: `t('Нэвтрэх')`, `t('{{v0}} мэдүүлэг', { v0: n })`. Орчуулгагүй бол монгол текст (интерполяцтай). */
export function t(key, vars) {
  return i18next.t(key, { ...vars, defaultValue: key });
}

export function setLanguage(next) {
  if (!Object.hasOwn(LANGS, next) || next === lang) return;
  try {
    window.localStorage.setItem(STORAGE, next);
  } catch {
    /* хадгалж чадахгүй бол энэ удаад л */
  }
  window.location.reload();
}

/**
 * Серверийн (монгол) мессежийг орчуулна: яг таарвал шууд, үгүй бол `{{v0}}` загвартай түлхүүрүүдийг regex-ээр тулгана
 * (ж: “Энэ операторт 3 нээлттэй мэдүүлэг…”). Олдохгүй бол эх монгол мессеж.
 */
let templates = null;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function translateServer(msg) {
  if (!msg || lang === 'mn' || typeof msg !== 'string') return msg;
  if (Object.hasOwn(en, msg)) return en[msg];
  if (!templates) {
    templates = Object.keys(en)
      .filter((k) => k.includes('{{v'))
      // esc() нь “{{v0}}”-г “\{\{v0\}\}” болгоно → тэр хэсгийг бүлэг болгож сольно
      .map((k) => ({ k, re: new RegExp(`^${esc(k).replace(/\\\{\\\{v\d\\\}\\\}/g, '(.+?)')}$`) }));
  }
  for (const { k, re } of templates) {
    const m = re.exec(msg);
    if (m) return i18next.t(k, Object.fromEntries(m.slice(1).map((v, i) => [`v${i}`, v])));
  }
  return msg;
}

/** Огноо, цагийн формат хэлтэй уялдана */
export const locale = lang === 'en' ? 'en-GB' : 'mn-MN';
