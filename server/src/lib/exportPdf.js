// “Мэдээллээ татах” — мэдүүлэгчийн бүх мэдээллийг НЭГ PDF болгоно (ZIP-ийн оронд):
//   нүүр (бүртгэл, профайл — паспорт бүтнээр, баримтын сангийн жагсаалт, импорт, мэдэгдэл) →
//   мэдүүлэг бүр (анкет, бүрдлийн үнэлгээний түүх, нэмэлт багц, хүргүүлсэн, албан үр дүн, хавсралтын жагсаалт SHA-256-тай) →
//   тухайн мэдүүлгийн хавсаргасан PDF/зургийг хуудас болгон нэгтгэнэ.
// Текстийг pdfkit-ээр (DejaVu Sans — кирилл, Ө/Ү), нэгтгэх, хуудас бүрт “АЛБАН БАРИМТ БИШ”-ийг pdf-lib + fontkit-ээр
// (мөн DejaVu-г embed). Ажилтны нэр оруулахгүй (D-36). Зөвхөн эзэмшигчид (routes/privacy.js).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import PDFKit from 'pdfkit';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { query, one } from '../db.js';
import { readFile } from './storage.js';
import { APP_SELECT, loadApplicationDetail, OUTCOME_LABEL } from './applications.js';
import { loadProfile, serializeProfile, listProfileDocs, serializeProfileDoc } from './profile.js';
import { render } from './notify.js';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

export const NOT_OFFICIAL = 'АЛБАН БАРИМТ БИШ';
const A4 = [595.28, 841.89];

const fmtDate = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '—');
const fmtDT = (v) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`);
const SEX = { M: 'Эрэгтэй', F: 'Эмэгтэй' };
const MARITAL = { SINGLE: 'Гэрлээгүй', MARRIED: 'Гэрлэсэн', DIVORCED: 'Салсан', WIDOWED: 'Бэлэвсэн' };
const SCAN = { ACCEPTED: 'шалгасан', PENDING: 'вирус шалгаж байна', REJECTED: 'вирус илэрсэн — устгагдсан' };
const EXPIRY = { EXPIRED: 'ХУГАЦАА ДУУССАН', EXPIRING: 'хугацаа дуусах гэж байна', VALID: 'хүчинтэй', NO_EXPIRY: '' };

/** pdfkit-ээр текстэн хэсэг үүсгэж Buffer буцаана */
function textSection(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFKit({ size: 'A4', margins: { top: 56, bottom: 64, left: 50, right: 50 }, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', FONT);
    doc.registerFont('B', FONT_BOLD);
    doc.font('R').fontSize(10).fillColor('#142b44');
    const w = {
      doc,
      title: (t) => doc.font('B').fontSize(16).fillColor('#142b44').text(t).moveDown(0.3),
      note: (t, color = '#c62828') => doc.font('R').fontSize(9).fillColor(color).text(t).fillColor('#142b44').moveDown(0.3),
      h: (t) => {
        if (doc.y > doc.page.height - 140) doc.addPage();
        doc.moveDown(0.6).font('B').fontSize(12).fillColor('#136b8f').text(t).moveDown(0.25).fillColor('#142b44');
      },
      row: (k, v) =>
        doc
          .font('B')
          .fontSize(9.5)
          .text(`${k}: `, { continued: true })
          .font('R')
          .text(v === undefined || v === null || v === '' ? '—' : String(v)),
      para: (t) => doc.font('R').fontSize(9.5).text(t),
      item: (t) => doc.font('R').fontSize(9).text(`• ${t}`, { indent: 6 }),
      mono: (t) => doc.font('R').fontSize(7.5).fillColor('#52606d').text(t, { indent: 14 }).fillColor('#142b44'),
      gap: () => doc.moveDown(0.3),
    };
    build(w);
    doc.end();
  });
}

function formRows(w, f) {
  if (!f) return w.para('Анкет бөглөгдөөгүй.');
  const x = f.extraFields || {};
  w.row('Овог / нэр (латин)', `${f.familyName || ''} ${f.givenName || ''}`.trim());
  w.row('Төрсөн огноо', fmtDate(f.birthDate));
  w.row('Хүйс', SEX[x.sex] || x.sex);
  w.row('Иргэншил', f.nationalityCode);
  w.row('Гэр бүлийн байдал', MARITAL[x.maritalStatus] || x.maritalStatus);
  w.row('Паспортын дугаар', f.passportNumber);
  w.row('Паспорт олгосон', fmtDate(x.passportIssuedOn));
  w.row('Паспорт дуусах', fmtDate(f.passportExpiresOn));
  w.row('Имэйл', f.contactEmail);
  w.row('Утас', f.contactPhone);
  w.row('Гэрийн хаяг', x.homeAddress);
  w.row('Ажил эрхлэлт', x.occupation);
  w.row('Ажлын газар / сургууль', x.employerOrSchool);
  w.row('Аяллын зорилго', f.travelPurpose);
  w.row('Орох / гарах', `${fmtDate(f.intendedEntryOn)} — ${fmtDate(f.intendedExitOn)}`);
  w.row('Байрлах хаяг', x.stayAddress);
}

/** Мэдүүлгийн бүх файлын мөр (анхны + нэмэлт багц) — хавсаргах дарааллаар */
async function applicationFiles(applicationId) {
  return query(
    `SELECT d.*, r.title AS requirement_title, s.round_no
       FROM application_documents d
       JOIN visa_requirements r ON r.requirement_id = d.requirement_id
       LEFT JOIN application_supplements s ON s.supplement_id = d.supplement_id
      WHERE d.application_id = ? ORDER BY COALESCE(s.round_no, 0), r.sort_order, d.uploaded_at`,
    [applicationId],
  );
}

/**
 * @returns {Promise<Buffer>} нэгтгэсэн PDF
 */
export async function buildExportPdf(userId, { generatedAt = new Date() } = {}) {
  const user = await one('SELECT email, display_name, created_at, email_verified_at FROM users WHERE user_id = ?', [userId]);
  const profileRow = await loadProfile(userId);
  const profile = serializeProfile(profileRow, { revealPassport: true });
  const vault = (await listProfileDocs(userId)).map(serializeProfileDoc);
  const apps = await query(`${APP_SELECT} WHERE a.applicant_id = ? ORDER BY a.created_at`, [userId]);
  const imports = await query('SELECT * FROM imported_applications WHERE applicant_id = ? ORDER BY applied_on', [userId]);
  const notes = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id', [userId]);

  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  out.setTitle('Цахим виз — хувийн мэдээллийн хуулбар');
  out.setAuthor('Цахим виз');
  out.setSubject(`${NOT_OFFICIAL} — хувийн мэдээллийн хуулбар`);
  out.setCreationDate(generatedAt);
  const font = await out.embedFont(fs.readFileSync(FONT), { subset: true });
  const fontBold = await out.embedFont(fs.readFileSync(FONT_BOLD), { subset: true });

  const append = async (buf) => {
    const src = await PDFDocument.load(buf);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  };

  // ── Нүүр: бүртгэл, профайл, баримтын сан, импорт, мэдэгдэл ──
  await append(
    await textSection((w) => {
      w.title('ЦАХИМ ВИЗ — хувийн мэдээллийн хуулбар');
      w.note(
        `${NOT_OFFICIAL}. Визийн шийдвэр биш. Дотоод лавлах дугаар нь консулын визийн дугаар биш. ` +
          'Энэ файлд паспортын дугаар зэрэг нууц мэдээлэл бий — найдвартай хадгална уу.',
      );
      w.row('Үүсгэсэн', fmtDT(generatedAt));
      w.h('Бүртгэл');
      w.row('Нэр', user.display_name);
      w.row('Имэйл', user.email);
      w.row('Бүртгүүлсэн', fmtDT(user.created_at));
      w.row('Имэйл баталгаажсан', user.email_verified_at ? fmtDT(user.email_verified_at) : 'үгүй');
      w.h('Профайл — хувийн мэдээлэл');
      if (!profileRow) w.para('Профайл бөглөгдөөгүй.');
      else {
        w.row('Овог / нэр (латин)', `${profile.familyName} ${profile.givenName}`.trim());
        w.row('Төрсөн огноо', fmtDate(profile.birthDate));
        w.row('Хүйс', SEX[profile.sex] || profile.sex);
        w.row('Иргэншил', profile.nationalityCode);
        w.row('Гэр бүлийн байдал', MARITAL[profile.maritalStatus] || profile.maritalStatus);
        w.row('Паспортын дугаар', profile.passportNumber);
        w.row('Паспорт олгосон / дуусах', `${fmtDate(profile.passportIssuedOn)} — ${fmtDate(profile.passportExpiresOn)}`);
        w.row('Имэйл / утас', `${profile.contactEmail || '—'} · ${profile.contactPhone || '—'}`);
        w.row('Гэрийн хаяг', profile.homeAddress);
        w.row('Ажил эрхлэлт', profile.occupation);
        w.row('Ажлын газар / сургууль', profile.employerOrSchool);
      }
      w.h(`Бичиг баримтын сан (${vault.length})`);
      if (!vault.length) w.para('Баримт хадгалаагүй.');
      for (const d of vault) {
        const exp = EXPIRY[d.expiry] ? ` · ${EXPIRY[d.expiry]}` : '';
        w.item(
          `${d.typeName}${d.title ? ` — ${d.title}` : ''}: ${d.originalName} (${size(d.sizeBytes)}) · олгосон ${fmtDate(d.issuedOn)} · хүчинтэй ${fmtDate(d.validUntil)}${exp} · ${SCAN[d.scanStatus] || d.scanStatus}`,
        );
        w.mono(`SHA-256 ${d.sha256}`);
      }
      w.note(
        'Баримтын сангийн файлуудыг энд хуудас болгон оруулаагүй — жагсаалт л. Мэдүүлэгт хавсаргасан хуулбарууд мэдүүлэг бүрийн ард бий.',
        '#52606d',
      );
      w.h(`Өмнөх (импортолсон) мэдүүлэг (${imports.length})`);
      if (!imports.length) w.para('Байхгүй.');
      for (const x of imports)
        w.item(
          `${x.public_id} · ${x.country_name} · ${x.visa_category} · ${fmtDate(x.applied_on)} · ${OUTCOME_LABEL[x.outcome] || x.outcome} (импортолсон, баталгаажаагүй)`,
        );
      w.h(`Мэдүүлэг (${apps.length})`);
      if (!apps.length) w.para('Мэдүүлэг байхгүй.');
      for (const a of apps) w.item(`${a.public_id} · ${a.code} · ${a.status} · үүсгэсэн ${fmtDate(a.created_at)}`);
      w.h(`Мэдэгдэл (${notes.length})`);
      for (const n of notes.slice(-200)) w.item(`${fmtDT(n.created_at)} · ${render(n).title}${n.ref ? ` · ${n.ref}` : ''}`);
    }),
  );

  // ── Мэдүүлэг бүр + хавсралтууд ──
  for (const a of apps) {
    const d = await loadApplicationDetail(a, { revealPassport: true, viewer: 'APPLICANT' });
    const files = await applicationFiles(a.application_id);
    const embedPlan = files.map((f) => ({ f, embed: f.scan_status === 'ACCEPTED' }));
    await append(
      await textSection((w) => {
        w.title(`Мэдүүлэг ${d.publicId}`);
        w.note(`${NOT_OFFICIAL}. Бүрдлийн үнэлгээ нь визийн шийдвэр биш.`);
        w.row('Улс · ангилал', `${d.visa.country.name} · ${d.visa.code} — ${d.visa.name}`);
        w.row('Мэдээллийн хувилбар', `v${d.visa.versionNo} (шалгасан ${fmtDate(d.visa.verifiedAt)})`);
        w.row('Төлөв', d.statusLabel || d.status);
        w.row('Үүсгэсэн / илгээсэн / архивласан', `${fmtDT(d.createdAt)} · ${fmtDT(d.submittedAt)} · ${fmtDT(d.archivedAt)}`);
        w.h('Анкет');
        formRows(w, d.form);
        w.h('Бүрдлийн үнэлгээний түүх');
        if (!d.reviews.length) w.para('Үнэлгээ хараахан ороогүй.');
        for (const r of [...d.reviews].reverse())
          w.item(
            `#${r.reviewNo} · ${r.completeness === 'COMPLETE' ? 'Бүрэн' : 'Дутуу'} · ${fmtDT(r.reviewedAt)}${r.comment ? ` — ${r.comment}` : ''}`,
          );
        if (d.supplements.length) {
          w.h('Нэмэлт материалын багц');
          for (const s of [...d.supplements].reverse())
            w.item(
              `Багц ${s.roundNo} (үнэлгээ #${s.reviewNo}) · ${s.status} · илгээсэн ${fmtDT(s.submittedAt)}${s.note ? ` — ${s.note}` : ''}`,
            );
        }
        if (d.handover) {
          w.h('Хүргүүлсэн');
          w.row('Байгууллага', d.handover.authority);
          w.row('Албан дугаар', d.handover.officialRef);
          w.row('Огноо', fmtDate(d.handover.deliveredOn));
        }
        if (d.officialResults.length) {
          w.h('Албан ёсны үр дүн (мэдүүлэгчийн мэдээлснээр)');
          for (const r of [...d.officialResults].reverse())
            w.item(
              `#${r.entryNo} · ${r.outcomeLabel} · шалгасан ${fmtDate(r.checkedOn)} · ${r.source}${r.verification ? ` · тулгалт: ${r.verification.verdict}` : ' · баталгаажаагүй'}`,
            );
        }
        w.h(`Хавсралт (${files.length})`);
        if (!files.length) w.para('Хавсралт байхгүй.');
        for (const { f, embed } of embedPlan) {
          const where = f.round_no ? `нэмэлт багц ${f.round_no}` : 'анхны илгээлт';
          w.item(
            `${f.requirement_title} — ${f.original_name} (${size(Number(f.size_bytes))}, ${where}${f.source_profile_document_id ? ', профайлаас' : ''}) · ${embed ? 'дараагийн хуудсуудад' : SCAN[f.scan_status] || f.scan_status}`,
          );
          w.mono(`SHA-256 ${f.sha256}`);
        }
      }),
    );
    for (const { f, embed } of embedPlan) if (embed) await appendAttachment(out, f, d.publicId, font, fontBold);
  }

  // ── Хуудас бүрт: усан тэмдэг + доод мөр ──
  const pages = out.getPages();
  pages.forEach((p, i) => {
    const { width, height } = p.getSize();
    const wm = NOT_OFFICIAL;
    const wmSize = Math.min(width, height) / 11;
    const wmWidth = fontBold.widthOfTextAtSize(wm, wmSize);
    p.drawText(wm, {
      x: width / 2 - (wmWidth / 2) * Math.cos(Math.PI / 6),
      y: height / 2 - (wmWidth / 2) * Math.sin(Math.PI / 6),
      size: wmSize,
      font: fontBold,
      color: rgb(0.78, 0.16, 0.16),
      opacity: 0.12,
      rotate: degrees(30),
    });
    const footer = `Цахим виз — хувийн мэдээллийн хуулбар · ${NOT_OFFICIAL} · ${fmtDate(generatedAt)} · ${i + 1}/${pages.length}`;
    const fs8 = 7.5;
    p.drawRectangle({ x: 0, y: 0, width, height: 22, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawText(footer, { x: (width - font.widthOfTextAtSize(footer, fs8)) / 2, y: 8, size: fs8, font, color: rgb(0.78, 0.16, 0.16) });
  });
  return Buffer.from(await out.save({ useObjectStreams: true }));
}

/** Нэг хавсралтыг хуудас болгон нэгтгэнэ; нэгтгэж чадахгүй бол тайлбар хуудас */
async function appendAttachment(out, f, ref, font, fontBold) {
  const caption = `Хавсралт · ${ref} · ${f.requirement_title} · ${f.original_name}`;
  const stamp = (page) => {
    const { width, height } = page.getSize();
    const s = 8;
    const text = caption.length > 140 ? `${caption.slice(0, 137)}…` : caption;
    page.drawRectangle({ x: 0, y: height - 20, width, height: 20, color: rgb(1, 1, 1), opacity: 0.9 });
    page.drawText(text, { x: 24, y: height - 14, size: s, font, color: rgb(0.08, 0.17, 0.27) });
  };
  const placeholder = (reason) => {
    const p = out.addPage(A4);
    p.drawText('Хавсралтыг нэгтгэж чадсангүй', { x: 50, y: 760, size: 14, font: fontBold, color: rgb(0.08, 0.17, 0.27) });
    const lines = [caption, `Шалтгаан: ${reason}`, `Хэмжээ: ${size(Number(f.size_bytes))}`, `SHA-256: ${f.sha256}`];
    lines.forEach((l, i) => p.drawText(l.length > 110 ? `${l.slice(0, 107)}…` : l, { x: 50, y: 730 - i * 18, size: 9, font }));
  };
  let buf;
  try {
    buf = await readFile(f.storage_key);
  } catch {
    return placeholder('файл хадгалалтаас олдсонгүй');
  }
  try {
    if (f.mime_type === 'application/pdf') {
      const src = await PDFDocument.load(buf); // нууцлалттай (шифрлэсэн) PDF бол алдаа → тайлбар хуудас
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p, i) => {
        out.addPage(p);
        if (i === 0) stamp(p);
      });
      if (!pages.length) placeholder('PDF хуудасгүй');
      return;
    }
    const img = f.mime_type === 'image/png' ? await out.embedPng(buf) : await out.embedJpg(buf);
    const p = out.addPage(A4);
    const [W, H] = A4;
    const box = { w: W - 80, h: H - 110 };
    const scale = Math.min(box.w / img.width, box.h / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    p.drawImage(img, { x: (W - w) / 2, y: (H - 30 - h) / 2 + 20, width: w, height: h });
    stamp(p);
  } catch (err) {
    logger.warn({ err, documentId: f.document_id }, 'export attachment not merged');
    placeholder(f.mime_type === 'application/pdf' ? 'PDF нууцлалттай эсвэл гэмтсэн' : 'зургийг уншиж чадсангүй');
  }
}
