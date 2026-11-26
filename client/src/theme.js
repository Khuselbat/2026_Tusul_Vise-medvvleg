// Өнгөний горим: харанхуй (анхдагч, D-90) / гэрэлтэй. Хэрэглэгч сонгоогүй бол харанхуй — CSS-ийн :root нь dark токен.
// Сонголтыг зөвхөн энэ хөтөчид (localStorage) хадгална — хувийн мэдээлэл биш.
const STORAGE = 'civiz.theme';

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
  return stored() || 'dark';
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
