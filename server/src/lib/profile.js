// Мэдүүлэгчийн профайл ба бичиг баримтын сан (migration 011–013).
// Профайл нь зөвхөн эзэмшигчид харагдана — оператор, админ хэзээ ч үзэхгүй. Мэдүүлэгт ашиглахдаа анкет руу ХУУЛЖ,
// хавсралтыг шинэ storage_key-тай ХУУЛНА: профайлыг дараа нь өөрчилсөн/устгасан ч мэдүүлэг өөрчлөгдөхгүй (BR-07, NFR-05).
import { z } from 'zod';
import { config } from '../config.js';
import { query, one, tx } from '../db.js';
import { encryptPassport, decryptPassport, maskPassport } from './crypto.js';
import { isoDate, latinName, today } from './applications.js';
import { readFile, saveFile, removeFile } from './storage.js';
import { audit } from './audit.js';

/** Хугацаа дуусахаас өмнө анхааруулах хоног (DOC_EXPIRY_WARN_DAYS, анхдагч 30) */
export const EXPIRY_WARN_DAYS = Number(process.env.DOC_EXPIRY_WARN_DAYS || 30);

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** NO_EXPIRY | EXPIRED | EXPIRING | VALID */
export function expiryStatus(validUntil, on = today()) {
  if (!validUntil) return 'NO_EXPIRY';
  if (validUntil < on) return 'EXPIRED';
  if (validUntil <= addDays(on, EXPIRY_WARN_DAYS)) return 'EXPIRING';
  return 'VALID';
}

const opt = (schema) => z.union([z.literal(''), z.null(), schema]).optional();

export const profileSchema = z
  .object({
    familyName: opt(latinName),
    givenName: opt(latinName),
    birthDate: opt(
      isoDate('Бодит огноо оруулна уу.')
        .refine((d) => d <= today(), 'Төрсөн огноо ирээдүйд байж болохгүй.')
        .refine((d) => d >= '1900-01-01', 'Бодит огноо оруулна уу.'),
    ),
    sex: opt(z.enum(['M', 'F'], { message: 'Хүйсээ сонгоно уу.' })),
    nationalityCode: opt(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, 'ISO 2 үсгийн код (жишээ: MN).'),
    ),
    maritalStatus: opt(z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'], { message: 'Гэр бүлийн байдлаа сонгоно уу.' })),
    passportNumber: opt(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{6,12}$/, 'Паспортын дугаар 6–12 латин үсэг, тоо.'),
    ),
    passportIssuedOn: opt(isoDate('Бодит огноо оруулна уу.').refine((d) => d <= today(), 'Олгосон огноо ирээдүйд байж болохгүй.')),
    // Хугацаа дууссан паспортыг ч хадгалж болно — анхааруулга харуулна
    passportExpiresOn: opt(isoDate('Бодит огноо оруулна уу.')),
    contactEmail: opt(z.string().trim().toLowerCase().email('Имэйлийн хэлбэр буруу байна.').max(254)),
    contactPhone: opt(
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{6,20}$/, 'Утасны дугаар буруу байна.'),
    ),
    homeAddress: opt(z.string().trim().max(300)),
    occupation: opt(z.string().trim().max(120)),
    employerOrSchool: opt(z.string().trim().max(200)),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.passportIssuedOn && d.passportExpiresOn && d.passportExpiresOn <= d.passportIssuedOn)
      ctx.addIssue({ code: 'custom', path: ['passportExpiresOn'], message: 'Дуусах огноо олгосон огнооноос хойш байна.' });
  });

const COLS = {
  familyName: 'family_name',
  givenName: 'given_name',
  birthDate: 'birth_date',
  sex: 'sex',
  nationalityCode: 'nationality_code',
  maritalStatus: 'marital_status',
  passportIssuedOn: 'passport_issued_on',
  passportExpiresOn: 'passport_expires_on',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  homeAddress: 'home_address',
  occupation: 'occupation',
  employerOrSchool: 'employer_or_school',
};

/** Профайлыг бүтнээр нь солино (хоосон талбар → NULL). Паспортыг шифрлэнэ. */
export async function saveProfile(q, userId, data) {
  const vals = Object.fromEntries(Object.entries(COLS).map(([k, c]) => [c, data[k] ? data[k] : null]));
  const enc = data.passportNumber ? encryptPassport(data.passportNumber) : null;
  vals.passport_number_enc = enc?.data ?? null;
  vals.passport_key_id = enc?.keyId ?? null;
  const cols = Object.keys(vals);
  await q(
    `INSERT INTO applicant_profiles (user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
    [userId, ...cols.map((c) => vals[c])],
  );
}

export async function loadProfile(userId) {
  return one('SELECT * FROM applicant_profiles WHERE user_id = ?', [userId]);
}

function passportOf(row) {
  if (!row?.passport_number_enc) return null;
  try {
    return decryptPassport(row.passport_number_enc, row.passport_key_id);
  } catch {
    return null;
  }
}

/** Профайлын JSON (эзэмшигчид — паспорт бүтнээр, эсвэл нууцалсан) */
export function serializeProfile(row, { revealPassport = true } = {}) {
  const out = Object.fromEntries(Object.keys(COLS).map((k) => [k, row?.[COLS[k]] ?? '']));
  const p = passportOf(row);
  out.passportNumber = p ? (revealPassport ? p : maskPassport(p)) : '';
  out.passportStatus = expiryStatus(row?.passport_expires_on || null);
  out.updatedAt = row?.updated_at ?? null;
  return out;
}

/** Мэдүүлгийн анкетын хэлбэрт (formSchema) хөрвүүлнэ — зөвхөн утгатай талбарууд (автомат бөглөлтийн САНАЛ) */
export function profileToForm(row, accountEmail) {
  if (!row) return { form: {}, filled: [] };
  const p = serializeProfile(row);
  const form = {};
  const set = (k, v) => {
    if (v) form[k] = v;
  };
  set('familyName', p.familyName);
  set('givenName', p.givenName);
  set('birthDate', p.birthDate);
  set('nationalityCode', p.nationalityCode);
  set('passportNumber', p.passportNumber);
  // Хугацаа дууссан паспортыг санал болгохгүй — хэрэглэгч шинэчилнэ
  if (p.passportStatus !== 'EXPIRED') set('passportExpiresOn', p.passportExpiresOn);
  set('contactEmail', p.contactEmail || accountEmail);
  set('contactPhone', p.contactPhone);
  const extra = {};
  for (const k of ['occupation', 'homeAddress', 'sex', 'maritalStatus', 'passportIssuedOn', 'employerOrSchool']) if (p[k]) extra[k] = p[k];
  if (Object.keys(extra).length) form.extraFields = extra;
  const filled = [...Object.keys(form).filter((k) => k !== 'extraFields'), ...Object.keys(extra).map((k) => `extraFields.${k}`)];
  return { form, filled, passportExpired: p.passportStatus === 'EXPIRED' };
}

export function serializeProfileDoc(d) {
  return {
    id: d.document_id,
    typeCode: d.type_code,
    typeName: d.type_name ?? null,
    title: d.title,
    originalName: d.original_name,
    mimeType: d.mime_type,
    sizeBytes: Number(d.size_bytes),
    sha256: d.sha256,
    scanStatus: d.scan_status,
    issuedOn: d.issued_on,
    validUntil: d.valid_until,
    expiry: expiryStatus(d.valid_until),
    uploadedAt: d.uploaded_at,
  };
}

export async function listProfileDocs(userId) {
  return query(
    `SELECT d.*, t.name_mn AS type_name FROM profile_documents d JOIN document_types t ON t.code = d.type_code
      WHERE d.user_id = ? ORDER BY t.sort_order, d.uploaded_at DESC`,
    [userId],
  );
}

/** Хугацаа дууссан/дуусах гэж буй паспорт, баримтын анхааруулга */
export function profileWarnings(profileRow, docs) {
  const w = [];
  const ps = expiryStatus(profileRow?.passport_expires_on || null);
  if (ps === 'EXPIRED' || ps === 'EXPIRING') w.push({ kind: 'PASSPORT', status: ps, date: profileRow.passport_expires_on });
  for (const d of docs) {
    const s = expiryStatus(d.valid_until);
    if (s === 'EXPIRED' || s === 'EXPIRING')
      w.push({
        kind: 'DOCUMENT',
        status: s,
        date: d.valid_until,
        documentId: d.document_id,
        typeName: d.type_name,
        name: d.title || d.original_name,
      });
  }
  return w;
}

export async function documentTypes() {
  return query('SELECT code, name_mn, has_expiry FROM document_types WHERE is_active = 1 ORDER BY sort_order');
}

/**
 * Ноорогт профайлын баримтуудыг шаардлага бүрт автоматаар хавсаргана (зөвхөн хоосон шаардлагад).
 * Шаардлага ↔ баримтын төрөл: requirement_document_types (олон төрөл, D-61). Төрөл бүрийн хамгийн шинэ баримтыг сонгоно.
 * Хугацаа дууссан, вирус шалгалтаас гараагүй баримтыг хавсаргахгүй — шалтгаантай нь буцаана.
 * Файлыг ХУУЛЖ (шинэ storage_key) бичнэ; хуулбар нь эх баримттай ижил байт тул шалгалтын төлөв ACCEPTED (D-63).
 */
export async function autofillDraftDocuments(req, draft) {
  const reqs = await query(
    `SELECT r.requirement_id, r.code, r.title, m.type_code
       FROM visa_requirements r
       JOIN requirement_document_types m ON m.requirement_id = r.requirement_id
       JOIN document_types t ON t.code = m.type_code
      WHERE r.version_id = ? ORDER BY r.sort_order, r.requirement_id, t.sort_order`,
    [draft.version_id],
  );
  const byReq = new Map();
  for (const r of reqs) {
    if (!byReq.has(r.requirement_id)) byReq.set(r.requirement_id, { id: r.requirement_id, title: r.title, types: [] });
    byReq.get(r.requirement_id).types.push(r.type_code);
  }
  const existing = await query('SELECT requirement_id, size_bytes FROM application_documents WHERE application_id = ?', [
    draft.application_id,
  ]);
  const filledReqs = new Set(existing.map((d) => d.requirement_id));
  let used = existing.reduce((s, d) => s + Number(d.size_bytes), 0);
  const docs = await listProfileDocs(req.user.id);
  const newestOf = (type) => docs.find((d) => d.type_code === type); // listProfileDocs: шинэ нь эхэнд (төрөл дотроо)

  const attached = [];
  const skipped = [];
  const missing = [];
  for (const r of byReq.values()) {
    if (filledReqs.has(r.id)) continue;
    let any = false;
    for (const type of r.types) {
      const d = newestOf(type);
      if (!d) continue;
      any = true;
      const base = {
        requirementId: r.id,
        requirementTitle: r.title,
        typeCode: type,
        profileDocumentId: d.document_id,
        name: d.original_name,
      };
      if (d.scan_status !== 'ACCEPTED') {
        skipped.push({ ...base, reason: d.scan_status === 'PENDING' ? 'SCAN_PENDING' : 'SCAN_REJECTED' });
        continue;
      }
      if (expiryStatus(d.valid_until) === 'EXPIRED') {
        skipped.push({ ...base, reason: 'EXPIRED', validUntil: d.valid_until });
        continue;
      }
      if (used + Number(d.size_bytes) > config.limits.totalBytes) {
        skipped.push({ ...base, reason: 'SIZE_LIMIT' });
        continue;
      }
      const buf = await readFile(d.storage_key);
      const copy = await saveFile(buf);
      if (copy.sha256 !== d.sha256) {
        await removeFile(copy.storageKey);
        skipped.push({ ...base, reason: 'INTEGRITY' });
        continue;
      }
      try {
        const docId = await tx(async (q) => {
          const ins = await q(
            `INSERT INTO application_documents (application_id, version_id, requirement_id, original_name, storage_key, mime_type,
                                                size_bytes, sha256, scan_status, source_profile_document_id)
             VALUES (?,?,?,?,?,?,?,?, 'ACCEPTED', ?)`,
            [
              draft.application_id,
              draft.version_id,
              r.id,
              d.original_name,
              copy.storageKey,
              d.mime_type,
              d.size_bytes,
              d.sha256,
              d.document_id,
            ],
          );
          await audit(
            req,
            { action: 'DOC_AUTOFILL', entityType: 'document', entityKey: ins.insertId, applicationId: draft.application_id },
            q,
          );
          return ins.insertId;
        });
        used += Number(d.size_bytes);
        attached.push({ ...base, documentId: docId, expiry: expiryStatus(d.valid_until), validUntil: d.valid_until });
      } catch (e) {
        await removeFile(copy.storageKey).catch(() => {});
        throw e;
      }
    }
    if (!any) missing.push({ requirementId: r.id, requirementTitle: r.title, typeCodes: r.types });
  }
  return { attached, skipped, missing };
}
