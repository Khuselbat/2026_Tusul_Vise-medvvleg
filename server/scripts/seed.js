// Жишээ (зохиомол) өгөгдөл. Бодит хувийн мэдээлэл ашиглахгүй (таамаглал А3).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { pool } from '../src/db.js';
import { config } from '../src/config.js';
import { encryptPassport } from '../src/lib/crypto.js';
import { saveFile } from '../src/lib/storage.js';

export const DEMO = {
  admin: { email: 'admin@civiz.mn', password: 'Admin1234', name: 'Системийн админ' },
  operator: { email: 'operator@civiz.mn', password: 'Operator1234', name: 'Оператор Сараа' },
  operator2: { email: 'operator2@civiz.mn', password: 'Operator1234', name: 'Оператор Тэмүүлэн' },
  applicant: { email: 'applicant@civiz.mn', password: 'Applicant1234', name: 'Бат Болд' },
};

const KR_RESULT_URL = 'https://www.visa.go.kr/openPage.do?MENU_ID=10301';
const C39_SOURCE = 'https://www.visaforkorea.mn/sites/g/files/tmzbdl2131/files/inline-files/C-3-9_Eng.pdf';

// Тайлан Хүснэгт 7 (KVAC C-3-9 баримт [6]): [код, нэр, заавар, заавал, хэнд хамаарах, эх/хуулбар, хэл/орчуулга].
// Хураамж, шийдвэрлэх хугацааг энд бичихгүй.
const C39_REQS = [
  [
    'FORM_PHOTO',
    'Визийн анкет ба цээж зураг',
    'Сүүлийн 6 сард авсан 3.5 × 4.5 см цээж зураг хавсаргана.',
    1,
    'Бүх мэдүүлэгч',
    'ORIGINAL',
    'Анкетыг англи эсвэл солонгос хэлээр бөглөнө.',
  ],
  [
    'PASSPORT_COPY',
    'Гадаад паспортын хуулбар',
    'Мэдээлэл бүхий хуудасны хуулбарыг байршуулна. Эх хувийг материал хүлээлгэн өгөхдөө заавал авч очно.',
    1,
    'Бүх мэдүүлэгч',
    'BOTH',
    null,
  ],
  [
    'FINANCIAL',
    'Санхүүгийн чадварын нотолгоо',
    'Ажлын газрын тодорхойлолт, банкны хуулга г.м. Нэг баримтыг бүх хүнд ижил шаардахгүй.',
    1,
    'Ажил, бизнес болон бусад нөхцөлөөс хамаарна',
    null,
    'Монгол баримтын орчуулгын шаардлагыг ЭСЯ-ны журмаас шалгана.',
  ],
  [
    'FAMILY',
    'Гэр бүлийн баримт (хамаарах бол)',
    'Гэрлэлтийн лавлагаа; насанд хүрээгүй хүүхэдтэй зорчих бол нэмэлт баримт.',
    0,
    'Гэрлэсэн эсвэл насанд хүрээгүй хүүхэдтэй зорчих мэдүүлэгч',
    null,
    null,
  ],
  ['ADDITIONAL', 'Нэмэлт материал', 'ЭСЯ эсвэл оператор нэмэлт баримт шаардсан үед энд хавсаргана.', 0, 'Шаардсан тохиолдолд', null, null],
];

// Хамгийн жижиг хүчинтэй PDF ба PNG (жишээ хавсралт)
const DEMO_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj 4 0 obj<</Length 44>>stream\nBT /F1 14 Tf 20 60 Td (DEMO DOCUMENT) Tj ET\nendstream endobj 5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
const DEMO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAAOAAH0o4HcAAAAAElFTkSuQmCC',
  'base64',
);

/**
 * @param staffMfaSecret — (E2E/тест) ажилтны 2FA-г энэ base32 нууцаар урьдчилан идэвхжүүлнэ.
 *   Анхдагчаар хоосон: ажилтан анх нэвтрэхдээ QR-аар бүртгүүлнэ.
 */
export async function seed({ withDemoApplications = true, rounds = config.isTest ? 4 : 10, staffMfaSecret = null } = {}) {
  // Мэдэгдэж буй нууц үгтэй жишээ хэрэглэгчдийг production-д хэзээ ч үүсгэхгүй.
  if (config.isProd)
    throw new Error('Жишээ өгөгдөл (seed) production орчинд хориглогдсон. Анхны админыг `npm run user:create-admin`-аар үүсгэнэ.');
  const conn = await pool.getConnection();
  const q = async (sql, p = []) => (await conn.query(sql, p))[0];
  try {
    await conn.beginTransaction();
    const role = async (code) => (await q('SELECT role_id FROM roles WHERE code = ?', [code]))[0].role_id;
    // Жишээ хэрэглэгчдийн имэйл баталгаажсан (зохиомол хаяг тул захидал хүрэхгүй)
    const mkUser = async (u, code) => {
      const mfa = staffMfaSecret && code !== 'APPLICANT' ? encryptPassport(staffMfaSecret) : null;
      return (
        await q(
          `INSERT INTO users (public_id, role_id, email, password_hash, display_name, email_verified_at, mfa_secret_enc, mfa_key_id, mfa_enabled_at)
           VALUES (?,?,?,?,?, CURRENT_TIMESTAMP(6), ?, ?, ?)`,
          [
            crypto.randomUUID(),
            await role(code),
            u.email,
            await bcrypt.hash(u.password, rounds),
            u.name,
            mfa?.data ?? null,
            mfa?.keyId ?? null,
            mfa ? new Date() : null,
          ],
        )
      ).insertId;
    };

    const adminId = await mkUser(DEMO.admin, 'ADMIN');
    const opId = await mkUser(DEMO.operator, 'OPERATOR');
    await mkUser(DEMO.operator2, 'OPERATOR');
    const applicantId = await mkUser(DEMO.applicant, 'APPLICANT');

    // Эхний хувилбарт зөвхөн БНСУ идэвхтэй. Бусад улсын нэрийг баталгаажуулсны дараа админ нэмнэ.
    const kr = (
      await q('INSERT INTO countries (iso_code, name_mn, service_status, official_result_url) VALUES (?,?,?,?)', [
        'KR',
        'БНСУ',
        'ACTIVE',
        KR_RESULT_URL,
      ])
    ).insertId;

    const c39 = (await q('INSERT INTO visa_types (country_id, code, is_active) VALUES (?,?,1)', [kr, 'C-3-9'])).insertId;
    const v1 = (
      await q(
        `INSERT INTO visa_info_versions (visa_type_id, version_no, name_mn, description, source_url, verified_at, verified_by, created_by, published_at)
       VALUES (?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP(6))`,
        [
          c39,
          1,
          'Богино хугацааны аялал жуулчлал (C-3-9)',
          'Богино хугацаагаар аялал жуулчлалын зорилгоор зорчих иргэдэд зориулсан ангилал. Материалын жагсаалтыг KVAC-ын нийтэд нээлттэй баримтад үндэслэв; ЭСЯ-ны шинэ журамтай тулгаж, мэдүүлэг өгөхийн өмнө дахин шалгана уу. Хураамж, шийдвэрлэх хугацааг тогтмол утгаар заахгүй — албан ёсны мэдэгдлийг үзнэ үү.',
          C39_SOURCE,
          '2026-10-30',
          adminId,
          adminId,
        ],
      )
    ).insertId;
    const reqIds = {};
    let i = 0;
    for (const [code, title, instr, req, appliesTo, origCopy, lang] of C39_REQS) {
      i += 1;
      reqIds[code] = (
        await q(
          `INSERT INTO visa_requirements (version_id, code, title, instructions, applies_to, original_or_copy, translation_note, is_required, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [v1, code, title, instr, appliesTo, origCopy, lang, req, i * 10],
        )
      ).insertId;
    }
    // Шаардлага ↔ профайлын баримтын төрөл (migration 013). Санхүүгийн нотолгоонд хэд хэдэн төрөл тохирно.
    const C39_DOC_TYPES = {
      FORM_PHOTO: ['PHOTO'],
      PASSPORT_COPY: ['PASSPORT_COPY'],
      FINANCIAL: ['EMPLOYMENT_CERT', 'BANK_STATEMENT'],
      FAMILY: ['FAMILY_CERT'],
    };
    for (const [code, types] of Object.entries(C39_DOC_TYPES)) {
      for (const t of types) await q('INSERT INTO requirement_document_types (requirement_id, type_code) VALUES (?, ?)', [reqIds[code], t]);
    }

    // Админы ноорог хувилбарын жишээ (нийтлэгдээгүй тул зочинд харагдахгүй)
    const d2 = (await q('INSERT INTO visa_types (country_id, code, is_active) VALUES (?,?,0)', [kr, 'D-2'])).insertId;
    await q('INSERT INTO visa_info_versions (visa_type_id, version_no, name_mn, description, created_by) VALUES (?,?,?,?,?)', [
      d2,
      1,
      'Суралцах (D-2) — ноорог',
      'Шаардлагыг баталгаажуулж байна.',
      adminId,
    ]);

    if (withDemoApplications) {
      const mkApp = async (ref, status, daysAgo, operator) => {
        const id = (
          await q(
            `INSERT INTO applications (public_id, applicant_id, assigned_operator_id, version_id, idempotency_key, status, created_at, submitted_at, archived_at)
           VALUES (?,?,?,?,?,?, NOW(6) - INTERVAL ? DAY, NOW(6) - INTERVAL ? DAY, NOW(6) - INTERVAL ? DAY)`,
            [ref, applicantId, operator, v1, crypto.randomUUID(), status, daysAgo, daysAgo, daysAgo],
          )
        ).insertId;
        const enc = encryptPassport('E1234567');
        await q(
          `INSERT INTO application_forms (application_id, family_name, given_name, birth_date, nationality_code, passport_number_enc,
             passport_key_id, passport_expires_on, contact_email, contact_phone, travel_purpose, intended_entry_on, intended_exit_on, extra_fields)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            'BAT',
            'BOLD',
            '1995-04-12',
            'MN',
            enc.data,
            enc.keyId,
            '2031-06-30',
            DEMO.applicant.email,
            '+976 9900 0000',
            'Сөүл хотод аялал жуулчлал',
            '2027-01-10',
            '2027-01-20',
            JSON.stringify({ occupation: 'Инженер', homeAddress: 'Улаанбаатар', stayAddress: 'Seoul, Jung-gu' }),
          ],
        );
        for (const code of ['FORM_PHOTO', 'PASSPORT_COPY', 'FINANCIAL']) {
          const buf = code === 'FORM_PHOTO' ? DEMO_PNG : DEMO_PDF;
          const { storageKey, sha256 } = await saveFile(buf);
          await q(
            `INSERT INTO application_documents (application_id, version_id, requirement_id, original_name, storage_key, mime_type, size_bytes, sha256, scan_status)
             VALUES (?,?,?,?,?,?,?,?, 'ACCEPTED')`,
            [
              id,
              v1,
              reqIds[code],
              code === 'FORM_PHOTO' ? 'photo.png' : `${code.toLowerCase()}.pdf`,
              storageKey,
              code === 'FORM_PHOTO' ? 'image/png' : 'application/pdf',
              buf.length,
              sha256,
            ],
          );
        }
        return id;
      };
      const a1 = await mkApp('KR-20261020-DEMO01', 'COMPLETE', 22, opId);
      await q(
        "INSERT INTO reviews (application_id, operator_id, review_no, completeness, comment, reviewed_at) VALUES (?,?,1,'INCOMPLETE',?, NOW(6) - INTERVAL 20 DAY)",
        [a1, opId, 'Банкны хуулга сүүлийн 3 сарын байх шаардлагатай.'],
      );
      await q(
        "INSERT INTO reviews (application_id, operator_id, review_no, completeness, comment, reviewed_at) VALUES (?,?,2,'COMPLETE',?, NOW(6) - INTERVAL 18 DAY)",
        [a1, opId, 'Материалын бүрдэл бүрэн.'],
      );
      await mkApp('KR-20261105-DEMO02', 'IN_REVIEW', 6, opId);
      await mkApp('KR-20261109-DEMO03', 'SUBMITTED', 2, null);
    }
    await conn.commit();
    return { adminId, opId, applicantId, versionId: v1, reqIds };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Windows/Linux аль алинд ажиллахаар файлын нэрээр шалгана
if (path.basename(process.argv[1] || '') === 'seed.js') {
  try {
    await seed();
    console.log('Жишээ өгөгдөл орлоо. Нэвтрэх эрхүүд (ажилтан анх нэвтрэхдээ 2FA-г QR-аар тохируулна):');
    for (const [k, u] of Object.entries(DEMO)) console.log(`  ${k.padEnd(10)} ${u.email} / ${u.password}`);
  } catch (e) {
    console.error(`Seed амжилтгүй: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
