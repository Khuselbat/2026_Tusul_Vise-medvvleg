// Серверийн API-тай харилцах нимгэн давхарга. Cookie-д суурилсан сесс (httpOnly).
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Алдаа гарлаа.');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields || {};
    this.missing = body?.error?.missing || [];
    this.conflicts = body?.error?.conflicts || [];
  }
}

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, url, body, { form } = {}) {
  const headers = { 'X-Requested-With': 'civiz' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: { message: 'Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.' } });
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized && !url.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
  upload: (u, form) => request('POST', u, undefined, { form }),
};

/**
 * POST хүсэлтээр файл татах (ж: мэдээллийн ZIP). Алдаа бол JSON-оос ApiError.
 * Хариуг blob болгоод түр холбоосоор хадгалуулна.
 */
export async function downloadPost(url, body, fallbackName = 'download') {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Requested-With': 'civiz', 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { error: { message: 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.' } });
  }
  if (!res.ok) {
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  const blob = await res.blob();
  const name = /filename="?([^"]+)"?/.exec(res.headers.get('content-disposition') || '')?.[1] || fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
  return name;
}

/** Файл байршуулах явцыг харуулах (XHR) */
export function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Requested-With', 'civiz');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError(0, { error: { message: 'Файл дамжуулалт тасарлаа. Дахин оролдоно уу.' } }));
    xhr.send(form);
  });
}

/** Idempotency түлхүүр (давхар дарахад давхар бичлэг үүсэхгүй) */
export const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
      );

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};
