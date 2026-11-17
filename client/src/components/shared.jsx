import { useState } from 'react';
import { Modal, Badge, fmtBytes, fmtDate, fmtDateTime, DL } from './ui.jsx';

/** Хамгаалалттай файл үзэгч (Зураг 48/52): PDF-ийг нээх, зураг томруулах, татах */
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
          <span className="small muted" style={{ marginRight: 'auto' }}>
            {fmtBytes(doc.sizeBytes)} · SHA-256 {doc.sha256?.slice(0, 12)}…
          </span>
          {isPdf && (
            <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer">
              Шинэ цонхонд
            </a>
          )}
          <a className="btn btn-primary" href={`${url}?download=1`}>
            Татах
          </a>
        </>
      }
    >
      {isPdf ? (
        <>
          <iframe className="viewer" src={url} title={doc.originalName} />
          <p className="small muted mb0" style={{ marginTop: 8 }}>
            PDF харагдахгүй бол “Шинэ цонхонд” эсвэл “Татах” товчийг ашиглана уу.
          </p>
        </>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <img className={`viewer-img ${zoom ? 'zoom' : ''}`} src={url} alt={doc.originalName} onClick={() => setZoom((z) => !z)} />
        </div>
      )}
    </Modal>
  );
}

export function Steps({ current }) {
  const items = ['Анкет', 'Материал', 'Хянах ба илгээх'];
  return (
    <ol className="steps" aria-label="Алхам">
      {items.map((t, i) => (
        <li
          key={t}
          className={`step ${i === current ? 'on' : ''} ${i < current ? 'done' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <b>{i < current ? '✓' : i + 1}</b>
          {t}
        </li>
      ))}
    </ol>
  );
}

export function FormSummary({ form }) {
  if (!form) return <p className="muted">Анкет бөглөөгүй.</p>;
  const x = form.extraFields || {};
  return (
    <DL
      items={[
        ['Овог / нэр', `${form.familyName} ${form.givenName}`],
        ['Төрсөн огноо', fmtDate(form.birthDate)],
        ['Иргэншил', form.nationalityCode],
        ['Паспорт', form.passportNumber],
        ['Паспорт дуусах', fmtDate(form.passportExpiresOn)],
        ['Имэйл', form.contactEmail],
        ['Утас', form.contactPhone],
        ['Аяллын зорилго', form.travelPurpose],
        ['Орох / гарах', `${fmtDate(form.intendedEntryOn)} — ${fmtDate(form.intendedExitOn)}`],
        x.occupation && ['Ажил эрхлэлт', x.occupation],
        x.homeAddress && ['Гэрийн хаяг', x.homeAddress],
        x.stayAddress && ['Байрлах хаяг', x.stayAddress],
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
          <div key={r.id} className="between" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
            <div>
              <strong>{r.title}</strong>
              {docs.length === 0 && <div className="small muted">Файл хавсаргаагүй</div>}
              {docs.map((d) => (
                <div key={d.id} className="file-line">
                  <button className="btn-link" onClick={() => onOpen(d)}>
                    {d.originalName}
                  </button>
                  <span>{fmtBytes(d.sizeBytes)}</span>
                </div>
              ))}
            </div>
            {docs.length > 0 ? (
              <Badge tone="ok">Хавсаргасан</Badge>
            ) : r.isRequired ? (
              <Badge tone="danger">Дутуу</Badge>
            ) : (
              <Badge tone="muted">Сонголттой</Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewTimeline({ reviews }) {
  if (!reviews?.length) return <p className="muted">Үнэлгээ хараахан оруулаагүй.</p>;
  return (
    <ol className="timeline">
      {reviews.map((r) => (
        <li key={r.reviewNo} className={r.completeness === 'COMPLETE' ? 'ok' : 'warn'}>
          <div className="between">
            <strong>
              #{r.reviewNo} · {r.completeness === 'COMPLETE' ? 'Бүрдэл бүрэн' : 'Дутуу — нэмэлт материал шаардсан'}
            </strong>
            <span className="small muted">{fmtDateTime(r.reviewedAt)}</span>
          </div>
          {r.comment && (
            <p className="mb0" style={{ margin: '4px 0 0' }}>
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
  <p className="small muted mb0">Бүрдлийн төлөв нь визийн шийдвэр биш. Дотоод лавлах дугаар нь консулын визийн дугаар биш.</p>
);

/** Нотолгоо файлыг FileViewer-д нээх хэлбэрт оруулна (/api/files/evidence/:id). */
export const asEvidence = (e) => (e ? { ...e, url: `/api/files/evidence/${e.id}` } : null);
