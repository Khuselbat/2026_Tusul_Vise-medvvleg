import { z } from 'zod';

/**
 * Zod 4-ийн анхдагч (англи) мессежийг монголоор. Схемд тусгай мессеж заасан бол тэр нь давуу.
 * Хэрэглэгчид харагдах бүх алдаа монгол байх (CLAUDE.md кодын хэв маяг).
 */
z.config({
  customError: (iss) => {
    if (iss.code === 'invalid_type') return iss.input === undefined || iss.input === null ? 'Заавал бөглөнө.' : 'Утгын төрөл буруу байна.';
    if (iss.code === 'too_small') return iss.origin === 'string' ? 'Хэт богино байна.' : 'Утга хэт бага байна.';
    if (iss.code === 'too_big') return iss.origin === 'string' ? 'Хэт урт байна.' : 'Утга хэт их байна.';
    if (iss.code === 'invalid_value') return 'Зөвшөөрөгдөх утгаас сонгоно уу.';
    if (iss.code === 'invalid_format') return iss.format === 'email' ? 'Имэйлийн хэлбэр буруу байна.' : 'Хэлбэр буруу байна.';
    if (iss.code === 'unrecognized_keys') return 'Танигдаагүй талбар байна.';
    return 'Утга буруу байна.';
  },
});

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Нэвтрэх шаардлагатай.') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Энэ үйлдлийг хийх эрхгүй байна.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Мэдээлэл олдсонгүй.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new HttpError(409, 'CONFLICT', message, details);

/** async route-ийн алдааг express-д дамжуулах */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** zod схемээр шалгаж, алдааг талбар бүрээр буцаана */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('Оруулсан мэдээллийг шалгана уу.', { fields });
  }
  return r.data;
}
