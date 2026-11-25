// Өнгөний горим: гэрэлтэй / харанхуй. Хэрэглэгч сонгоогүй бол системийн тохиргоог (prefers-color-scheme) CSS өөрөө дагана.
// Сонголтыг зөвхөн энэ хөтөчид (localStorage) хадгална — хувийн мэдээлэл биш.
const STORAGE = 'civiz.theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function stored() {
  try {
    const v = window.localStorage.getItem(STORAGE);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Одоо харагдаж буй горим */
export function currentTheme() {
  return stored() || (media?.matches ? 'dark' : 'light');
}

export function applyTheme() {
  if (typeof document === 'undefined') return;
  const s = stored();
  if (s) document.documentElement.dataset.theme = s;
  else delete document.documentElement.dataset.theme;
}

export function setTheme(next) {
  try {
    window.localStorage.setItem(STORAGE, next);
  } catch {
    /* хадгалж чадахгүй бол энэ удаад л */
  }
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = next;
}

// Модуль ачаалахад (React render-ээс өмнө) хэрэгжүүлнэ — анивчихгүй
applyTheme();
