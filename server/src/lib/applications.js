import { z } from 'zod';
import { query, one } from '../db.js';
import { decryptPassport, maskPassport } from './crypto.js';
import { STATUS_LABEL } from './visa.js';

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = (msg) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msg)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), msg);
// Албан ёсны анкетыг англи хэлээр бөглөнө — паспорт дээрх латин бичлэг
const latinName = z
  .string()
  .trim()
  .min(1, 'Заавал бөглөнө.')
  .max(100)
  .regex(/^[A-Za-z][A-Za-z\s'-]*$/, 'Паспорт дээрх латин үсгээр бичнэ үү.')
  .transform((s) => s.replace(/\s+/g, ' ').toUpperCase());

/** FR-04 / Зураг 43: анкетын талбар ба огнооны шалгалт */
export const formSchema = z
  .object({
    familyName: latinName,
    givenName: latinName,
    birthDate: isoDate('Бодит огноо оруулна уу.')
      .refine((d) => d <= today(), 'Төрсөн огноо ирээдүйд байж болохгүй.')
      .refine((d) => d >= '1900-01-01', 'Бодит огноо оруулна уу.'),
    nationalityCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'ISO 2 үсгийн код (жишээ: MN).'),
    passportNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,12}$/, 'Паспортын дугаар 6–12 латин үсэг, тоо.'),
    passportExpiresOn: isoDate('Бодит огноо оруулна уу.').refine((d) => d > today(), 'Паспортын хугацаа дууссан байна.'),
    contactEmail: z.string().trim().toLowerCase().email('Имэйлийн хэлбэр буруу байна.').max(254),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'Утасны дугаар буруу байна.'),
    travelPurpose: z.string().trim().min(3, 'Аяллын зорилгоо бичнэ үү.').max(500),
    intendedEntryOn: isoDate('Бодит огноо оруулна уу.').refine((d) => d >= today(), 'Орох огноо өнгөрсөн байна.'),
    intendedExitOn: isoDate('Бодит огноо оруулна уу.'),
    extraFields: z
      .object({
        occupation: z.string().trim().max(120).optional().default(''),
        homeAddress: z.string().trim().max(300).optional().default(''),
        stayAddress: z.string().trim().max(300).optional().default(''),
      })
      .optional()
      .default({}),
  })
  .superRefine((d, ctx) => {
    if (d.intendedExitOn < d.intendedEntryOn)
      ctx.addIssue({ code: 'custom', path: ['intendedExitOn'], message: 'Гарах огноо орох огнооноос хойш байна.' });
    if (d.passportExpiresOn <= d.intendedExitOn)
      ctx.addIssue({ code: 'custom', path: ['passportExpiresOn'], message: 'Паспорт аяллын хугацаанд хүчинтэй байх ёстой.' });
  });

/** Талбарын алдаа болон огнооны харьцуулалтыг нэг дор буцаана (zod нь суурь алдаатай үед superRefine-ийг алгасдаг). */
export function parseForm(body) {
  const r = formSchema.safeParse(body);
  if (r.success) return { data: r.data, fields: null };
  const fields = {};
  for (const i of r.error.issues) {
    const k = i.path.join('.') || '_';
    if (!fields[k]) fields[k] = i.message;
  }
  const d = body || {};
  const iso = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!fields.intendedExitOn && iso(d.intendedEntryOn) && iso(d.intendedExitOn) && d.intendedExitOn < d.intendedEntryOn) {
    fields.intendedExitOn = 'Гарах огноо орох огнооноос хойш байна.';
  }
  if (!fields.passportExpiresOn && iso(d.passportExpiresOn) && iso(d.intendedExitOn) && d.passportExpiresOn <= d.intendedExitOn) {
    fields.passportExpiresOn = 'Паспорт аяллын хугацаанд хүчинтэй байх ёстой.';
  }
  return { data: null, fields };
}

export function serializeForm(f, { revealPassport }) {
  if (!f) return null;
  let passport = null;
  try {
    passport = decryptPassport(f.passport_number_enc, f.passport_key_id);
  } catch {
    passport = null;
  }
  let extra = f.extra_fields;
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra);
    } catch {
      extra = {};
    }
  }
  return {
    familyName: f.family_name,
    givenName: f.given_name,
    birthDate: f.birth_date,
    nationalityCode: f.nationality_code,
    passportNumber: revealPassport ? passport : maskPassport(passport),
    passportExpiresOn: f.passport_expires_on,
    contactEmail: f.contact_email,
    contactPhone: f.contact_phone,
    travelPurpose: f.travel_purpose,
    intendedEntryOn: f.intended_entry_on,
    intendedExitOn: f.intended_exit_on,
    extraFields: extra || {},
  };
}

export function serializeDoc(d) {
  return {
    id: d.document_id,
    requirementId: d.requirement_id,
    originalName: d.original_name,
    mimeType: d.mime_type,
    sizeBytes: Number(d.size_bytes),
    sha256: d.sha256,
    scanStatus: d.scan_status,
    uploadedAt: d.uploaded_at,
  };
}

/** Мэдүүлгийн бүрэн дэлгэрэнгүй (анкет, хавсралт, шаардлага, үнэлгээний түүх) */
export async function loadApplicationDetail(appRow, { revealPassport }) {
  const [form, docs, reqs, reviews] = await Promise.all([
    one('SELECT * FROM application_forms WHERE application_id = ?', [appRow.application_id]),
    query('SELECT * FROM application_documents WHERE application_id = ? ORDER BY requirement_id, uploaded_at', [appRow.application_id]),
    query(
      'SELECT requirement_id, code, title, instructions, is_required FROM visa_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id',
      [appRow.version_id],
    ),
    query(
      `SELECT r.review_no, r.completeness, r.comment, r.reviewed_at, u.display_name AS operator_name
         FROM reviews r JOIN users u ON u.user_id = r.operator_id
        WHERE r.application_id = ? ORDER BY r.review_no DESC`,
      [appRow.application_id],
    ),
  ]);
  return {
    publicId: appRow.public_id,
    status: appRow.status,
    statusLabel: STATUS_LABEL[appRow.status],
    createdAt: appRow.created_at,
    submittedAt: appRow.submitted_at,
    archivedAt: appRow.archived_at,
    visa: {
      versionId: appRow.version_id,
      versionNo: appRow.version_no,
      code: appRow.code,
      name: appRow.name_mn,
      sourceUrl: appRow.source_url,
      verifiedAt: appRow.verified_at,
      country: { iso: appRow.iso_code, name: appRow.country_name, officialResultUrl: appRow.official_result_url },
    },
    applicantName: appRow.applicant_name,
    operatorName: appRow.operator_name ?? null,
    form: serializeForm(form, { revealPassport }),
    requirements: reqs.map((q) => ({
      id: q.requirement_id,
      code: q.code,
      title: q.title,
      instructions: q.instructions,
      isRequired: !!q.is_required,
    })),
    documents: docs.map(serializeDoc),
    reviews: reviews.map((r) => ({
      reviewNo: r.review_no,
      completeness: r.completeness,
      comment: r.comment,
      reviewedAt: r.reviewed_at,
      operatorName: r.operator_name,
    })),
  };
}

export const APP_SELECT = `
  SELECT a.*, v.version_no, v.name_mn, v.source_url, v.verified_at, v.published_at, t.code, t.is_active AS type_active,
         c.iso_code, c.name_mn AS country_name, c.service_status, c.official_result_url,
         ua.display_name AS applicant_name, uo.display_name AS operator_name
    FROM applications a
    JOIN visa_info_versions v ON v.version_id = a.version_id
    JOIN visa_types t ON t.visa_type_id = v.visa_type_id
    JOIN countries c ON c.country_id = t.country_id
    JOIN users ua ON ua.user_id = a.applicant_id
    LEFT JOIN users uo ON uo.user_id = a.assigned_operator_id`;
