// Үе 4 — мэдүүлгийн хураангуй PDF (анкет + хавсралтын жагсаалт + лавлах дугаар). “АЛБАН БАРИМТ БИШ” усан тэмдэгтэй.
// Паспортын дугаарыг нууцлагдсан хэлбэрээр (хэвлэж, дамжуулж болзошгүй тул). Ажилтны нэр оруулахгүй.
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const STATUS = {
  SUBMITTED: 'Илгээсэн',
  IN_REVIEW: 'Бүрдэл хянаж байна',
  INCOMPLETE: 'Нэмэлт материал шаардсан',
  COMPLETE: 'Бүрдэл бүрэн',
  DELIVERED: 'Эрх бүхий байгууллагад хүргүүлсэн',
};
const fmtDate = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '—');
const fmtDT = (v) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(n / 1024))} KiB`);

/** @returns {Promise<Buffer>} */
export function buildSummaryPdf(a, { generatedAt = new Date() } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Мэдүүлгийн хураангуй ${a.publicId}`, Author: 'Цахим виз', Subject: 'Албан баримт биш' },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('R', FONT);
    doc.registerFont('B', FONT_BOLD);

    // Усан тэмдэг: pdfkit-д фонт, курсор (x/y) нь save/restore-д ордоггүй тул гараар хадгалж сэргээнэ
    // (эс бөгөөс агуулга хуудасны доороос эхэлж, шинэ хуудасны текст 54pt болно).
    const watermark = () => {
      const { x, y } = doc;
      const prevFont = doc._font;
      const prevSize = doc._fontSize;
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font('B').fontSize(54).fillColor('#c62828').opacity(0.1);
      doc.text('АЛБАН БАРИМТ БИШ', 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center', lineBreak: false });
      doc.restore();
      doc.opacity(1).fillColor('#142b44');
      doc._font = prevFont;
      doc.fontSize(prevSize);
      doc.x = x;
      doc.y = y;
    };
    watermark();
    doc.on('pageAdded', watermark);

    const h = (t) => {
      doc.moveDown(0.8).font('B').fontSize(12).fillColor('#136b8f').text(t).moveDown(0.3).fillColor('#142b44');
    };
    const row = (k, v) => {
      doc
        .font('B')
        .fontSize(9.5)
        .text(`${k}: `, { continued: true })
        .font('R')
        .text(v ?? '—');
    };

    doc.font('B').fontSize(16).text('ЦАХИМ ВИЗ — мэдүүлгийн хураангуй');
    doc
      .font('R')
      .fontSize(9)
      .fillColor('#c62828')
      .text('Энэ нь АЛБАН БАРИМТ БИШ. Визийн шийдвэр биш. Дотоод лавлах дугаар нь консулын визийн дугаар биш.');
    doc.fillColor('#142b44').moveDown(0.6);
    doc.font('B').fontSize(13).text(`Дотоод лавлах дугаар: ${a.publicId}`);

    h('Мэдүүлэг');
    row('Улс · ангилал', `${a.visa.country.name} · ${a.visa.code} — ${a.visa.name}`);
    row('Мэдээллийн хувилбар', `v${a.visa.versionNo} (шалгасан ${fmtDate(a.visa.verifiedAt)})`);
    row('Дотоод төлөв', STATUS[a.status] || a.status);
    row('Илгээсэн', fmtDT(a.submittedAt));

    if (a.form) {
      const f = a.form;
      h('Анкет');
      row('Овог, нэр', `${f.familyName} ${f.givenName}`);
      row('Төрсөн огноо', fmtDate(f.birthDate));
      row('Иргэншил', f.nationalityCode);
      row('Паспорт (нууцлагдсан)', f.passportNumber);
      row('Паспорт дуусах', fmtDate(f.passportExpiresOn));
      row('Имэйл', f.contactEmail);
      row('Утас', f.contactPhone);
      row('Аяллын зорилго', f.travelPurpose);
      row('Орох — гарах', `${fmtDate(f.intendedEntryOn)} — ${fmtDate(f.intendedExitOn)}`);
    }

    h('Хавсралт (анхны илгээлт)');
    for (const r of a.requirements) {
      const docs = a.documents.filter((d) => d.requirementId === r.id);
      doc
        .font('B')
        .fontSize(9.5)
        .text(`${r.title}${r.isRequired ? ' *' : ''}`);
      if (!docs.length) doc.font('R').fontSize(9).fillColor('#687c90').text('   хавсаргаагүй').fillColor('#142b44');
      for (const d of docs)
        doc
          .font('R')
          .fontSize(9)
          .text(`   • ${d.originalName} · ${kb(d.sizeBytes)} · SHA-256 ${d.sha256.slice(0, 16)}…`);
    }

    const rounds = (a.supplements || []).filter((s) => s.status === 'SUBMITTED');
    if (rounds.length) {
      h('Нэмэлт материалын багц');
      for (const s of rounds) {
        doc
          .font('B')
          .fontSize(9.5)
          .text(`Багц #${s.roundNo} · ${fmtDT(s.submittedAt)}`);
        for (const d of s.documents)
          doc
            .font('R')
            .fontSize(9)
            .text(`   • ${d.originalName} · ${kb(d.sizeBytes)}`);
      }
    }

    if (a.reviews.length) {
      h('Бүрдлийн үнэлгээ (визийн шийдвэр биш)');
      for (const r of [...a.reviews].reverse()) {
        doc
          .font('R')
          .fontSize(9)
          .text(
            `#${r.reviewNo} · ${fmtDT(r.reviewedAt)} · ${r.completeness === 'COMPLETE' ? 'Бүрдэл бүрэн' : 'Дутуу'}${r.comment ? ` — ${r.comment}` : ''}`,
          );
      }
    }

    if (a.handover) {
      h('Эрх бүхий байгууллагад хүргүүлсэн');
      row('Байгууллага', a.handover.authority);
      row('Албан бүртгэлийн дугаар', a.handover.officialRef);
      row('Огноо', fmtDate(a.handover.deliveredOn));
    }

    if (a.officialResults?.length) {
      h('Албан ёсны үр дүн (мэдүүлэгчийн мэдээлснээр)');
      for (const r of a.officialResults) {
        const v = r.verification
          ? r.verification.verdict === 'MATCHES'
            ? 'оператор нотолгоотой тулгасан'
            : 'нотолгоотой таараагүй'
          : 'баталгаажаагүй';
        doc
          .font('R')
          .fontSize(9)
          .text(`#${r.entryNo} · ${fmtDate(r.checkedOn)} · ${r.outcomeLabel} · ${r.source} · ${v}`);
      }
    }

    doc.moveDown(1.2).font('R').fontSize(8).fillColor('#687c90');
    doc.text(
      `Үүсгэсэн: ${fmtDT(generatedAt)}. Энэхүү хураангуйг Цахим виз систем үүсгэв. Албан ёсны визийн хариуг тухайн улсын албан ёсны порталаас шалгана. ` +
        'Систем визийн шийдвэр гаргахгүй.',
    );
    doc.end();
  });
}
