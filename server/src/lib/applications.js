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

export function serializeEvidence(f) {
  if (!f) return null;
  return {
    id: f.file_id,
    kind: f.kind,
    originalName: f.original_name,
    mimeType: f.mime_type,
    sizeBytes: Number(f.size_bytes),
    sha256: f.sha256,
    scanStatus: f.scan_status ?? 'ACCEPTED',
    uploadedAt: f.uploaded_at,
  };
}

export const OUTCOME_LABEL = {
  NOT_CHECKED: 'Шалгаагүй',
  PENDING: 'Шийдвэр хүлээж байна',
  APPROVED: 'Зөвшөөрсөн (мэдүүлэгчийн мэдээлснээр)',
  REFUSED: 'Татгалзсан (мэдүүлэгчийн мэдээлснээр)',
};

/** Нэмэлт материалын багцууд (round бүр файлтайгаа). Оператор зөвхөн илгээсэн багцыг харна. */
async function loadSupplements(applicationId, { includeDrafts }) {
  const rows = await query(
    `SELECT s.*, r.review_no FROM application_supplements s JOIN reviews r ON r.review_id = s.review_id
      WHERE s.application_id = ? ${includeDrafts ? '' : "AND s.status = 'SUBMITTED'"} ORDER BY s.round_no DESC`,
    [applicationId],
  );
  if (!rows.length) return [];
  const docs = await query('SELECT * FROM application_documents WHERE supplement_id IN (?) ORDER BY requirement_id, uploaded_at', [
    rows.map((s) => s.supplement_id),
  ]);
  return rows.map((s) => ({
    roundNo: s.round_no,
    reviewNo: s.review_no,
    status: s.status,
    note: s.note,
    createdAt: s.created_at,
    submittedAt: s.submitted_at,
    documents: docs.filter((d) => d.supplement_id === s.supplement_id).map(serializeDoc),
  }));
}

async function loadHandover(applicationId) {
  const h = await one(
    `SELECT h.*, u.display_name AS operator_name, f.file_id, f.kind, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.scan_status, f.uploaded_at
       FROM application_handovers h JOIN users u ON u.user_id = h.operator_id
       JOIN evidence_files f ON f.file_id = h.evidence_file_id
      WHERE h.application_id = ?`,
    [applicationId],
  );
  if (!h) return null;
  return {
    authority: h.authority,
    officialRef: h.official_ref,
    deliveredOn: h.delivered_on,
    note: h.note,
    operatorName: h.operator_name,
    recordedAt: h.recorded_at,
    evidence: serializeEvidence(h),
  };
}

/** F11: мэдүүлэгчийн бүртгэсэн албан үр дүн (шинэ нь эхэнд) + операторын тулгалт */
async function loadOfficialResults(applicationId) {
  const rows = await query(
    `SELECT r.*, f.file_id, f.kind, f.original_name, f.mime_type, f.size_bytes, f.sha256, f.scan_status, f.uploaded_at,
            v.verdict, v.note AS verify_note, v.verified_at, uv.display_name AS verifier_name
       FROM official_results r
       LEFT JOIN evidence_files f ON f.file_id = r.evidence_file_id
       LEFT JOIN official_result_verifications v ON v.result_id = r.result_id
       LEFT JOIN users uv ON uv.user_id = v.operator_id
      WHERE r.application_id = ? ORDER BY r.entry_no DESC`,
    [applicationId],
  );
  return rows.map((r) => ({
    entryNo: r.entry_no,
    outcome: r.outcome,
    outcomeLabel: OUTCOME_LABEL[r.outcome],
    checkedOn: r.checked_on,
    source: r.source,
    sourceUrl: r.source_url,
    recordedAt: r.recorded_at,
    evidence: r.file_id ? serializeEvidence(r) : null,
    // “Баталгаажаагүй” — оператор нотолгоотой тулгах хүртэл (тайлан 5.3 алхам 5–6)
    verification: r.verdict ? { verdict: r.verdict, note: r.verify_note, verifiedAt: r.verified_at, operatorName: r.verifier_name } : null,
  }));
}

/**
 * Мэдүүлгийн бүрэн дэлгэрэнгүй (анкет, анхны хавсралт, нэмэлт багц, хүргүүлсэн, албан үр дүн, үнэлгээний түүх).
 * `viewer`: APPLICANT нь өөрийн ноорог багцыг харна; OPERATOR зөвхөн илгээсэн багцыг.
 */
export async function loadApplicationDetail(appRow, { revealPassport, viewer = 'APPLICANT' }) {
  const [form, docs, reqs, reviews, supplements, handover, officialResults] = await Promise.all([
    one('SELECT * FROM application_forms WHERE application_id = ?', [appRow.application_id]),
    query('SELECT * FROM application_documents WHERE application_id = ? AND supplement_id IS NULL ORDER BY requirement_id, uploaded_at', [
      appRow.application_id,
    ]),
    query(
      'SELECT requirement_id, code, title, instructions, applies_to, original_or_copy, translation_note, is_required FROM visa_requirements WHERE version_id = ? ORDER BY sort_order, requirement_id',
      [appRow.version_id],
    ),
    query(
      `SELECT r.review_no, r.completeness, r.comment, r.reviewed_at, u.display_name AS operator_name
         FROM reviews r JOIN users u ON u.user_id = r.operator_id
        WHERE r.application_id = ? ORDER BY r.review_no DESC`,
      [appRow.application_id],
    ),
    loadSupplements(appRow.application_id, { includeDrafts: viewer === 'APPLICANT' }),
    loadHandover(appRow.application_id),
    loadOfficialResults(appRow.application_id),
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
      appliesTo: q.applies_to,
      originalOrCopy: q.original_or_copy,
      translationNote: q.translation_note,
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
    supplements,
    handover,
    officialResults,
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
