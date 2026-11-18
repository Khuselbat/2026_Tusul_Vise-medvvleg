import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadWithProgress } from '../../api.js';
import { Page, Card, Button, Alert, ErrorBox, Skeleton, Badge, useAsync, fmtBytes, useToast } from '../../components/ui.jsx';
import { Steps, FileViewer, usePendingScanPoll } from '../../components/shared.jsx';
import { t } from '../../i18n.js';
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const OK_EXT = /\.(pdf|jpe?g|png)$/i;
const SKIP_REASON = {
  EXPIRED: (x) => t('хугацаа {{v0}}-нд дууссан', { v0: x.validUntil }),
  SCAN_PENDING: () => t('вирус шалгаж байна — дараа дахин оролдоно уу'),
  SCAN_REJECTED: () => t('вирус илэрсэн'),
  SIZE_LIMIT: () => t('нийт 100 MiB-аас хэтэрнэ'),
  INTEGRITY: () => t('файлын бүрэн бүтэн байдал зөрсөн'),
};
const sessionGet = (k) => {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const sessionSet = (k, v) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* хувийн горимд хадгалахгүй байж болно */
  }
};

// Зураг 44 Материал хавсаргах
export default function NewDocuments() {
  const [sp] = useSearchParams();
  const ref = sp.get('draft');
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/drafts/${ref}`), [ref]);
  usePendingScanPoll(data, reload); // Үе 3: вирус шалгалт дуусах хүртэл шинэчилнэ
  const [uploads, setUploads] = useState({}); // requirementId -> { progress, error, name }
  const [target, setTarget] = useState(null);
  const [drag, setDrag] = useState(false);
  const [viewing, setViewing] = useState(null);
  const inputRef = useRef();
  // Профайлын баримтын сангаас автоматаар хавсаргах — нооргийн анх орох үед нэг удаа (дараа нь товчоор)
  const [auto, setAuto] = useState(null);
  const [autoBusy, setAutoBusy] = useState(false);
  async function runAutofill() {
    setAutoBusy(true);
    try {
      const r = await api.post(`/api/app/drafts/${ref}/autofill-documents`);
      setAuto(r);
      if (r.attached.length) reload();
    } catch (ex) {
      toast(ex.message, 'danger');
    } finally {
      setAutoBusy(false);
    }
  }
  useEffect(() => {
    if (!ref || !data?.draft) return;
    const key = `civiz-autofill-${ref}`;
    if (sessionGet(key)) return;
    sessionSet(key, '1');
    runAutofill();
  }, [ref, !!data?.draft]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ref) return <Navigate to="/app/new" replace />;
  const d = data?.draft;
  const total = d ? d.documents.reduce((s, x) => s + x.sizeBytes, 0) : 0;
  const busy = Object.values(uploads).some((u) => u.progress !== undefined && u.progress < 101 && !u.error);
  async function uploadFile(reqId, file) {
    if (!file) return;
    let msg = null;
    if (!OK_EXT.test(file.name)) msg = t('Зөвхөн PDF, JPG, PNG файл.');
    else if (file.size > MAX_FILE)
      msg = t('Файл {{v0}} — 10 MiB-аас их байна.', {
        v0: fmtBytes(file.size),
      });
    else if (total + file.size > MAX_TOTAL) msg = t('Нийт хэмжээ 100 MiB-аас хэтэрнэ.');
    if (msg) {
      setUploads((u) => ({
        ...u,
        [reqId]: {
          error: msg,
          name: file.name,
        },
      }));
      return;
    }
    setUploads((u) => ({
      ...u,
      [reqId]: {
        progress: 0,
        name: file.name,
      },
    }));
    const fd = new FormData();
    fd.append('requirementId', String(reqId));
    fd.append('file', file);
    try {
      await uploadWithProgress(`/api/app/drafts/${ref}/documents`, fd, (p) =>
        setUploads((u) => ({
          ...u,
          [reqId]: {
            ...u[reqId],
            progress: Math.min(p, 99),
          },
        })),
      );
      setUploads((u) => {
        const n = {
          ...u,
        };
        delete n[reqId];
        return n;
      });
      reload();
    } catch (ex) {
      setUploads((u) => ({
        ...u,
        [reqId]: {
          error: ex.message,
          name: file.name,
        },
      }));
    }
  }
  async function removeDoc(doc) {
    try {
      await api.del(`/api/app/drafts/${ref}/documents/${doc.id}`);
      toast(t('Файлыг арилгалаа.'), 'info');
      reload();
    } catch (ex) {
      toast(ex.message, 'danger');
    }
  }
  const pick = (reqId) => {
    setTarget(reqId);
    inputRef.current.value = '';
    inputRef.current.click();
  };
  const firstMissing = d?.requirements.find((r) => !d.documents.some((x) => x.requirementId === r.id));
  const missingRequired = d
    ? d.requirements.filter((r) => r.isRequired && !d.documents.some((x) => x.requirementId === r.id && x.scanStatus === 'ACCEPTED'))
    : [];
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Шинэ мэдүүлэг'),
        },
      ]}
      title={t('Материал хавсаргах')}
      subtitle={d && `${d.visa.country.name} · ${d.visa.code} — ${d.visa.name}`}
    >
      <Steps current={1} />
      <ErrorBox error={error} onRetry={reload} />
      {auto && (auto.attached.length > 0 || auto.skipped.length > 0) && (
        <Alert tone={auto.skipped.length ? 'warn' : 'info'} title={t('Бичиг баримтын сангаас')}>
          {auto.attached.length > 0 && (
            <p className="mb0">
              {t('{{v0}} баримтыг хуулж хавсаргалаа — шалгаж, шаардлагатай бол сольж эсвэл арилгана уу.', { v0: auto.attached.length })}
            </p>
          )}
          {auto.skipped.length > 0 && (
            <ul className="mb0">
              {auto.skipped.map((x, i) => (
                <li key={i}>
                  {x.requirementTitle}: {x.name} — {t('хавсаргаагүй')} ({(SKIP_REASON[x.reason] || (() => x.reason))(x)})
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {loading && !d ? (
        <Skeleton rows={4} />
      ) : (
        d && (
          <>
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f && firstMissing) uploadFile(firstMissing.id, f);
              }}
            >
              <h3>{t('Файлаа энд чирж оруулах эсвэл сонгох')}</h3>
              <div className="muted">
                {t('PDF, JPEG, PNG · файл ≤10 MiB · нийт ≤100 MiB · одоо')} {fmtBytes(total || 1)} {t('ашигласан')}
              </div>
              {firstMissing && (
                <div className="small muted mt">
                  {t('Чирсэн файл “')}
                  {firstMissing.title}
                  {t('” хэсэгт хавсаргагдана.')}
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              hidden
              onChange={(e) => uploadFile(target, e.target.files?.[0])}
            />
            {d.requirements.map((r) => {
              const docs = d.documents.filter((x) => x.requirementId === r.id);
              const up = uploads[r.id];
              return (
                <Card key={r.id} className="req-row">
                  <div>
                    <h3>
                      {r.title} {r.isRequired && <span className="req">*</span>}
                    </h3>
                    {r.instructions && <div className="small muted">{r.instructions}</div>}
                    {docs.map((doc) => (
                      <div key={doc.id} className="file-line">
                        <button className="btn-link" onClick={() => setViewing(doc)}>
                          {doc.originalName}
                        </button>
                        <span>{fmtBytes(doc.sizeBytes)}</span>
                        {doc.fromProfile && <Badge tone="info">{t('Профайлаас')}</Badge>}
                        <Badge tone={doc.scanStatus === 'ACCEPTED' ? 'ok' : doc.scanStatus === 'REJECTED' ? 'danger' : 'info'}>
                          {doc.scanStatus === 'ACCEPTED'
                            ? t('Шалгагдсан')
                            : doc.scanStatus === 'REJECTED'
                              ? t('Татгалзсан')
                              : t('Шалгаж байна')}
                        </Badge>
                        <button className="btn-link danger" onClick={() => removeDoc(doc)}>
                          {t('Арилгах')}
                        </button>
                      </div>
                    ))}
                    {up && up.error && (
                      <div className="field-error">
                        {up.name}: {up.error}
                      </div>
                    )}
                    {up && !up.error && (
                      <div className="file-line">
                        <span>{up.name}</span>
                        <div className="progress">
                          <div
                            style={{
                              width: `${up.progress}%`,
                            }}
                          />
                        </div>
                        <span>{t('Шалгаж байна…')}</span>
                      </div>
                    )}
                    {!docs.length && !up && <div className="file-line">{t('Файл сонгоогүй')}</div>}
                  </div>
                  <div
                    className="row-actions"
                    style={{
                      alignItems: 'center',
                    }}
                  >
                    {docs.length ? (
                      <Badge tone="ok">{t('Хавсаргасан')}</Badge>
                    ) : r.isRequired ? (
                      <Badge tone="warn">{t('Заавал')}</Badge>
                    ) : (
                      <Badge tone="muted">{t('Сонголттой')}</Badge>
                    )}
                    <Button variant="ghost" className="btn-sm" onClick={() => pick(r.id)} disabled={!!up && !up.error}>
                      {docs.length ? t('Нэмж хавсаргах') : t('Файл сонгох')}
                    </Button>
                  </div>
                </Card>
              );
            })}
            {missingRequired.length > 0 && (
              <Alert tone="warn">
                {t('Заавал шаардлагатай')} {missingRequired.length} {t('материал дутуу байна:')}{' '}
                {missingRequired.map((m) => m.title).join(', ')}.
              </Alert>
            )}
            <p className="small muted">
              <Button variant="ghost" className="btn-sm" loading={autoBusy} onClick={runAutofill}>
                {t('Профайлаас хавсаргах')}
              </Button>{' '}
              {t('Хоосон шаардлагад бичиг баримтын сангаас тохирох баримтыг хуулж хавсаргана.')}{' '}
              <Link to="/app/documents">{t('Бичиг баримтын сан')}</Link>
            </p>
            <div className="page-footer">
              <Button disabled={missingRequired.length > 0 || busy} onClick={() => navigate(`/app/new/confirm?draft=${ref}`)}>
                {t('Үргэлжлүүлэх')}
              </Button>
              <Button variant="ghost" onClick={() => navigate(`/app/new?draft=${ref}`)}>
                {t('Буцах')}
              </Button>
            </div>
          </>
        )
      )}
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
