// Зочны нэг хуудас (/): хэсгүүдийн жагсаалт, идэвхтэй хэсгийн (scroll-spy) жижиг store, хэсэг рүү гүйлгэх.
// Header (GuestShell) ба хуудас (OnePage) хоёр тусдаа бүрэлдэхүүн тул төлөвийг энд хуваалцана.
import { useSyncExternalStore } from 'react';
import { t } from './i18n.js';

/** Дээд цэсний хэсгүүд: [id, богино нэр, дүрс] — дараалал нь хуудсан дээрх дараалал */
export const NAV_SECTIONS = [
  ['visas', t('Мэдээлэл'), 'book'],
  ['check', t('Хариу шалгах'), 'check'],
  ['how', t('Хэрхэн'), 'list'],
  ['faq', t('FAQ'), 'help'],
  ['contact', t('Холбоо барих'), 'file'],
];

let active = '';
const listeners = new Set();
export function setActiveSection(id) {
  if (id === active) return;
  active = id;
  listeners.forEach((l) => l());
}
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Одоо харагдаж буй хэсгийн id ('' = hero / дээд хэсэг) */
export const useActiveSection = () => useSyncExternalStore(subscribe, () => active);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** id-тай хэсэг рүү гүйлгэнэ (scroll-margin-top нь CSS-д). Олдвол true. */
export function scrollToSection(id, { smooth = true } = {}) {
  const el = id ? document.getElementById(id) : null;
  if (id && !el) return false;
  const behavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
  if (el) el.scrollIntoView({ behavior, block: 'start' });
  else window.scrollTo({ top: 0, behavior });
  return true;
}

/** URL-ийн hash-ийг түүх нэмэлгүй шинэчилнэ (React Router-ийн state-ийг хадгална) */
export function replaceHash(id) {
  const url = `${window.location.pathname}${window.location.search}${id ? `#${id}` : ''}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
    window.history.replaceState(window.history.state, '', url);
}
