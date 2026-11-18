import { useEffect, useState } from 'react';
import { Modal, Badge, fmtBytes, fmtDate, fmtDateTime, DL } from './ui.jsx';

/** Хамгаалалттай файл үзэгч (Зураг 48/52): PDF-ийг нээх, зураг томруулах, татах */
import { t } from '../i18n.js';
export function FileViewer({ doc, onClose }) {
  const [zoom, setZoom] = useState(false);
  if (!doc) return null;
  // Нотолгоо файл (хүргүүлсэн, албан үр дүн, импорт) өөр замаар үйлчлэгдэнэ
  const url = doc.url || `/api/files/${doc.id}`;
  const isPdf = doc.mimeType === 'application/pdf';
  return (
    <Modal
      open
      wide
      title={doc.originalName}
      onClose={onClose}
      footer={
        <>
          <span
            className="small muted"
            style={{
              marginRight: 'auto',
            }}
          >
            {fmtBytes(doc.sizeBytes)} · SHA-256 {doc.sha256?.slice(0, 12)}…
          </span>
          {isPdf && (
            <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
              {t('Шинэ цонхонд')}
            </a>
          )}
          <a className="btn btn-primary" href={`${url}?download=1`}>
            {t('Татах')}
          </a>
        </>
      }
    >
      {isPdf ? (
        <>
          <iframe className="viewer" src={url} title={doc.originalName} />
          <p
            className="small muted mb0"
            style={{
              marginTop: 8,
            }}
          >
            {t('PDF харагдахгүй бол “Шинэ цонхонд” эсвэл “Татах” товчийг ашиглана уу.')}
          </p>
        </>
      ) : (
        <div
          style={{
            overflow: 'auto',
            maxHeight: '70vh',
          }}
        >
          <img className={`viewer-img ${zoom ? 'zoom' : ''}`} src={url} alt={doc.originalName} onClick={() => setZoom((z) => !z)} />
        </div>
      )}
    </Modal>
  );
}
export function Steps({ current }) {
  const items = [t('Анкет'), t('Материал'), t('Хянах ба илгээх')];
  return (
    <ol className="steps" aria-label={t('Алхам')}>
      {items.map((tv, i) => (
        <li
          key={tv}
          className={`step ${i === current ? 'on' : ''} ${i < current ? 'done' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <b>{i < current ? '✓' : i + 1}</b>
          {tv}
        </li>
      ))}
    </ol>
  );
}
const MARITAL_LABEL = {
  SINGLE: () => t('Гэрлээгүй'),
  MARRIED: () => t('Гэрлэсэн'),
  DIVORCED: () => t('Салсан'),
  WIDOWED: () => t('Бэлэвсэн'),
};
export function FormSummary({ form }) {
  if (!form) return <p className="muted">{t('Анкет бөглөөгүй.')}</p>;
  const x = form.extraFields || {};
  return (
    <DL
      items={[
        [t('Овог / нэр'), `${form.familyName} ${form.givenName}`],
        [t('Төрсөн огноо'), fmtDate(form.birthDate)],
        x.sex && [t('Хүйс'), x.sex === 'M' ? t('Эрэгтэй') : x.sex === 'F' ? t('Эмэгтэй') : x.sex],
        [t('Иргэншил'), form.nationalityCode],
        x.maritalStatus && [t('Гэр бүлийн байдал'), MARITAL_LABEL[x.maritalStatus]?.() || x.maritalStatus],
        [t('Паспорт'), form.passportNumber],
        x.passportIssuedOn && [t('Паспорт олгосон'), fmtDate(x.passportIssuedOn)],
        [t('Паспорт дуусах'), fmtDate(form.passportExpiresOn)],
        [t('Имэйл'), form.contactEmail],
        [t('Утас'), form.contactPhone],
        [t('Аяллын зорилго'), form.travelPurpose],
        [t('Орох / гарах'), `${fmtDate(form.intendedEntryOn)} — ${fmtDate(form.intendedExitOn)}`],
        x.occupation && [t('Ажил эрхлэлт'), x.occupation],
        x.employerOrSchool && [t('Ажлын газар / сургууль'), x.employerOrSchool],
        x.homeAddress && [t('Гэрийн хаяг'), x.homeAddress],
        x.stayAddress && [t('Байрлах хаяг'), x.stayAddress],
      ]}
    />
  );
}

/** Шаардлага бүрээр хавсралтын жагсаалт (зөвхөн уншина) */
export function DocumentList({ requirements, documents, onOpen }) {
  return (
    <div className="stack">
      {requirements.map((r) => {
        const docs = documents.filter((d) => d.requirementId === r.id);
        return (
          <div
            key={r.id}
            className="between"
            style={{
              borderBottom: '1px solid var(--line)',
              paddingBottom: 10,
            }}
          >
            <div>
              <strong>{r.title}</strong>
              {docs.length === 0 && <div className="small muted">{t('Файл хавсаргаагүй')}</div>}
              {docs.map((d) => (
                <div key={d.id} className="file-line">
                  <FileOpenButton doc={d} onOpen={onOpen} />
                  <span>{fmtBytes(d.sizeBytes)}</span>
                  {d.fromProfile && <Badge tone="info">{t('Профайлаас')}</Badge>}
                </div>
              ))}
            </div>
            {docs.length > 0 ? (
              <Badge tone="ok">{t('Хавсаргасан')}</Badge>
            ) : r.isRequired ? (
              <Badge tone="danger">{t('Дутуу')}</Badge>
            ) : (
              <Badge tone="muted">{t('Сонголттой')}</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function ReviewTimeline({ reviews }) {
  if (!reviews?.length) return <p className="muted">{t('Үнэлгээ хараахан оруулаагүй.')}</p>;
  return (
    <ol className="timeline">
      {reviews.map((r) => (
        <li key={r.reviewNo} className={r.completeness === 'COMPLETE' ? 'ok' : 'warn'}>
          <div className="between">
            <strong>
              #{r.reviewNo} · {r.completeness === 'COMPLETE' ? t('Бүрдэл бүрэн') : t('Дутуу — нэмэлт материал шаардсан')}
            </strong>
            <span className="small muted">{fmtDateTime(r.reviewedAt)}</span>
          </div>
          {r.comment && (
            <p
              className="mb0"
              style={{
                margin: '4px 0 0',
              }}
            >
              {r.comment}
            </p>
          )}
          <div className="small muted">{r.operatorName}</div>
        </li>
      ))}
    </ol>
  );
}
export const NotDecisionNote = () => (
  <p className="small muted mb0">{t('Бүрдлийн төлөв нь визийн шийдвэр биш. Дотоод лавлах дугаар нь консулын визийн дугаар биш.')}</p>
);

/** Нотолгоо файлыг FileViewer-д нээх хэлбэрт оруулна (/api/files/evidence/:id). */
export const asEvidence = (e) =>
  e
    ? {
        ...e,
        url: `/api/files/evidence/${e.id}`,
      }
    : null;
const ORIG = {
  ORIGINAL: t('Эх хувь'),
  COPY: t('Хуулбар'),
  BOTH: t('Эх хувь ба хуулбар'),
};
export const ORIGINAL_OR_COPY = ORIG;

/** Тайлан 5.2: шаардлагын нэмэлт мэдээлэл — хэнд хамаарах, эх/хуулбар, хэл/орчуулга */
export function RequirementMeta({ r }) {
  const parts = [
    r.appliesTo && [t('Хэнд'), r.appliesTo],
    r.originalOrCopy && [t('Хэлбэр'), ORIG[r.originalOrCopy]],
    r.translationNote && [t('Хэл, орчуулга'), r.translationNote],
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="small muted">
      {parts.map(([k, v]) => (
        <div key={k}>
          <strong>{k}:</strong> {v}
        </div>
      ))}
    </div>
  );
}

/* ───────── Үе 3: вирусын шалгалтын төлөв ───────── */
export function ScanBadge({ status }) {
  if (!status || status === 'ACCEPTED') return null;
  return status === 'REJECTED' ? (
    <Badge tone="danger">{t('Вирус илэрсэн — устгагдсан')}</Badge>
  ) : (
    <Badge tone="info">{t('Вирус шалгаж байна')}</Badge>
  );
}

/** Өгөгдөлд PENDING файл байвал 4 сек тутам дахин уншина (шалгалт дуусах хүртэл). */
export function usePendingScanPoll(data, reload) {
  const pending = JSON.stringify(data ?? '').includes('"scanStatus":"PENDING"');
  useEffect(() => {
    if (!pending) return undefined;
    const tv2 = setInterval(reload, 4000);
    return () => clearInterval(tv2);
  }, [pending, reload]);
}

/** Нээх товч: шалгагдаагүй/татгалзсан файлыг нээхгүй */
export function FileOpenButton({ doc, onOpen, label }) {
  const ready = !doc.scanStatus || doc.scanStatus === 'ACCEPTED';
  return (
    <>
      <button className="btn-link" onClick={() => onOpen(doc)} disabled={!ready} title={ready ? undefined : t('Шалгалт дуусаагүй')}>
        {label || doc.originalName}
      </button>{' '}
      <ScanBadge status={doc.scanStatus} />
    </>
  );
}
