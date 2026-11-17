// Үе 1 UI: нэмэлт материалын багц (F07), хүргүүлсэн (4.2/5.3), албан үр дүн (F11).
import { useState } from 'react';
import { api, uuid } from '../api.js';
import { Card, Button, Field, Alert, Badge, Confirm, Modal, useToast, fmtBytes, fmtDate, fmtDateTime, DL } from './ui.jsx';
import { asEvidence, FileOpenButton } from './shared.jsx';
import { t, translateServer } from '../i18n.js';
const todayIso = () => new Date().toISOString().slice(0, 10);
function FileLine({ doc, onOpen, onRemove }) {
  return (
    <div className="file-line">
      <FileOpenButton doc={doc} onOpen={onOpen} />
      <span>{fmtBytes(doc.sizeBytes)}</span>
      {onRemove && (
        <button className="btn-link danger" onClick={() => onRemove(doc)}>
          {t('Арилгах')}
        </button>
      )}
    </div>
  );
}

/* ───────────── Нэмэлт материал ───────────── */

/** Илгээсэн (мэдүүлэгчид ноорог ч) багцуудын түүх. Анхны илгээлтээс тусдаа харагдана (BR-07). */
export function SupplementHistory({ supplements, requirements, onOpen }) {
  const done = (supplements || []).filter((s) => s.status === 'SUBMITTED');
  if (!done.length) return null;
  const title = (id) => requirements.find((r) => r.id === id)?.title || t('Материал');
  return (
    <Card>
      <h2>{t('Нэмэлт материалын багц')}</h2>
      <ol className="timeline">
        {done.map((s) => (
          <li key={s.roundNo} className="ok">
            <div className="between">
              <strong>
                {t('Багц #')}
                {s.roundNo} {t('· үнэлгээ #')}
                {s.reviewNo}
                {t('-ийн хариу')}
              </strong>
              <span className="small muted">{fmtDateTime(s.submittedAt)}</span>
            </div>
            {s.note && (
              <p
                style={{
                  margin: '4px 0',
                }}
              >
                {s.note}
              </p>
            )}
            {s.documents.map((d) => (
              <div key={d.id}>
                <span className="small muted">{title(d.requirementId)}: </span>
                <FileLine doc={d} onOpen={onOpen} />
              </div>
            ))}
          </li>
        ))}
      </ol>
      <p className="small muted mb0">{t('Анхны илгээлтийн анкет, хавсралт өөрчлөгдөөгүй — нэмэлт багц тусдаа хадгалагдана.')}</p>
    </Card>
  );
}

/** Мэдүүлэгч: “Нэмэлт материал шаардсан” үед хариу багц бэлтгэж илгээх. */
export function SupplementPanel({ app, onChanged, onOpen }) {
  const toast = useToast();
  const draft = app.supplements.find((s) => s.status === 'DRAFT');
  const base = `/api/app/applications/${app.publicId}/supplements`;
  const extra = app.requirements.find((r) => r.code === 'ADDITIONAL');
  const [reqId, setReqId] = useState(String(extra?.id || app.requirements[0]?.id || ''));
  const [note, setNote] = useState(draft?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'submit' | 'cancel'

  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (ex) {
      setErr(ex);
      if (ex.status === 409) onChanged();
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () => {
      await api.post(base);
      onChanged();
    });
  const upload = (file) =>
    run(async () => {
      if (!file) return;
      const form = new FormData();
      form.append('requirementId', reqId);
      form.append('file', file);
      await api.upload(`${base}/${draft.roundNo}/documents`, form);
      onChanged();
    });
  const remove = (doc) =>
    run(async () => {
      await api.del(`${base}/${draft.roundNo}/documents/${doc.id}`);
      onChanged();
    });
  const submit = () =>
    run(async () => {
      await api.put(`${base}/${draft.roundNo}`, {
        note,
      });
      await api.post(`${base}/${draft.roundNo}/submit`);
      setConfirm(null);
      toast(t('Нэмэлт материал илгээгдлээ.'));
      onChanged();
    }).finally(() => setConfirm(null));
  const cancel = () =>
    run(async () => {
      await api.del(`${base}/${draft.roundNo}`);
      setConfirm(null);
      onChanged();
    }).finally(() => setConfirm(null));
  return (
    <Card>
      <h2>{t('Нэмэлт материал илгээх')}</h2>
      <p
        className="small muted"
        style={{
          marginTop: 0,
        }}
      >
        {t('Операторын тайлбарын дагуу дутуу материалаа хавсаргана. Анхны илгээлт өөрчлөгдөхгүй; нэмэлт багц тусдаа архивлагдана.')}
      </p>
      {err && (
        <Alert tone="danger" title={err.message}>
          {err.missing?.map((m) => m.message).join(' ')}
        </Alert>
      )}
      {!draft ? (
        <Button onClick={start} loading={busy}>
          {t('Нэмэлт материал бэлтгэх')}
        </Button>
      ) : (
        <>
          <div className="form-grid">
            <Field label={t('Аль материалд хамаарах')} htmlFor="sup-req">
              <select id="sup-req" value={reqId} onChange={(e) => setReqId(e.target.value)}>
                {app.requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('Файл (PDF, JPG, PNG · ≤10 MB)')} htmlFor="sup-file">
              <input
                id="sup-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                disabled={busy}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </Field>
          </div>
          <div
            className="stack"
            style={{
              margin: '8px 0 12px',
            }}
          >
            {draft.documents.length === 0 ? (
              <div className="small muted">{t('Файл хавсаргаагүй байна.')}</div>
            ) : (
              draft.documents.map((d) => <FileLine key={d.id} doc={d} onOpen={onOpen} onRemove={remove} />)
            )}
          </div>
          <Field label={t('Оператор руу тайлбар (сонголттой)')} htmlFor="sup-note">
            <textarea id="sup-note" value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="row-actions mt">
            <Button disabled={busy || draft.documents.length === 0} onClick={() => setConfirm('submit')}>
              {t('Нэмэлт материал илгээх')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm('cancel')}>
              {t('Ноорог цуцлах')}
            </Button>
          </div>
        </>
      )}
      <Confirm
        open={confirm === 'submit'}
        title={t('Нэмэлт материал илгээх үү?')}
        confirmLabel={t('Илгээх')}
        loading={busy}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={submit}
      >
        {t('Илгээсний дараа энэ багцыг засах боломжгүй. Оператор дахин хянаж, үнэлгээг таны самбарт харуулна.')}
      </Confirm>
      <Confirm
        open={confirm === 'cancel'}
        title={t('Ноорог багцыг цуцлах уу?')}
        tone="danger"
        confirmLabel={t('Цуцлах')}
        loading={busy}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={cancel}
      >
        {t('Хавсаргасан файлууд устна. Анхны илгээлтэд нөлөөлөхгүй.')}
      </Confirm>
    </Card>
  );
}

/* ───────────── Хүргүүлсэн ───────────── */

export function HandoverCard({ handover, onOpen }) {
  if (!handover) return null;
  return (
    <Card>
      <h2>{t('Эрх бүхий байгууллагад хүргүүлсэн')}</h2>
      <DL
        items={[
          [t('Хүлээн авсан байгууллага'), handover.authority],
          [
            t('Албан бүртгэлийн дугаар'),
            <span key="ref" className="mono">
              {handover.officialRef}
            </span>,
          ],
          [t('Хүргүүлсэн огноо'), fmtDate(handover.deliveredOn)],
          [t('Бүртгэсэн'), `${handover.operatorName} · ${fmtDateTime(handover.recordedAt)}`],
          handover.note && [t('Тэмдэглэл'), handover.note],
          [t('Нотолгоо'), <FileOpenButton key="ev" doc={asEvidence(handover.evidence)} onOpen={onOpen} />],
        ]}
      />
      <p className="small muted mb0">{t('Хүргүүлсэн нь визийн шийдвэр биш. Албан ёсны хариуг Korea Visa Portal-аас шалгана.')}</p>
    </Card>
  );
}

/** Оператор: “Бүрдэл бүрэн” мэдүүлгийг хүргүүлсэн гэж бүртгэх (нэг удаа, засахгүй). */
export function HandoverForm({ publicId, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({
    authority: '',
    officialRef: '',
    deliveredOn: todayIso(),
    note: '',
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({
      ...x,
      [k]: e.target.value,
    }));
  function ask() {
    const fe = {};
    if (f.authority.trim().length < 2) fe.authority = t('Хүлээн авсан байгууллагыг бичнэ үү.');
    if (!f.officialRef.trim()) fe.officialRef = t('Албан бүртгэлийн дугаар заавал.');
    if (!f.deliveredOn) fe.deliveredOn = t('Огноо заавал.');
    if (!file) fe.file = t('Нотолгоо файл хавсаргана уу.');
    setErrors(fe);
    if (!Object.keys(fe).length) setOpen(true);
  }
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      Object.entries(f).forEach(([k, v]) => form.append(k, v));
      form.append('file', file);
      await api.upload(`/api/operator/applications/${publicId}/handover`, form);
      toast(t('Хүргүүлсэн бүртгэл хадгалагдлаа.'));
      onDone();
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex);
      if (ex.status === 409) onDone();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }
  return (
    <Card>
      <h2>{t('Хүргүүлсэн гэж бүртгэх')}</h2>
      <p
        className="small muted"
        style={{
          marginTop: 0,
        }}
      >
        {t(
          'Материалыг эрх бүхий байгууллагад (ЭСЯ, KVAC г.м.) бодитоор хүлээлгэн өгсний дараа тэдний олгосон дугаар, огноо, баримтаар бүртгэнэ.',
        )}
      </p>
      {err && !Object.keys(err.fields || {}).length && <Alert tone="danger">{err.message}</Alert>}
      <Field label={t('Хүлээн авсан байгууллага')} htmlFor="ho-auth" error={errors.authority} required>
        <input id="ho-auth" value={f.authority} onChange={set('authority')} maxLength={150} />
      </Field>
      <Field label={t('Албан бүртгэлийн дугаар')} htmlFor="ho-ref" error={errors.officialRef} required>
        <input id="ho-ref" value={f.officialRef} onChange={set('officialRef')} maxLength={64} />
      </Field>
      <Field label={t('Хүргүүлсэн огноо')} htmlFor="ho-date" error={errors.deliveredOn} required>
        <input id="ho-date" type="date" max={todayIso()} value={f.deliveredOn} onChange={set('deliveredOn')} />
      </Field>
      <Field label={t('Нотолгоо (хүлээн авсан баримт)')} htmlFor="ho-file" error={errors.file} required>
        <input
          id="ho-file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Field>
      <Field label={t('Тэмдэглэл (сонголттой)')} htmlFor="ho-note">
        <textarea id="ho-note" value={f.note} onChange={set('note')} maxLength={4000} />
      </Field>
      <div className="mt">
        <Button onClick={ask}>{t('Хүргүүлсэн гэж бүртгэх')}</Button>
      </div>
      <Confirm open={open} title={t('Хүргүүлсэн гэж бүртгэх үү?')} loading={busy} onClose={() => !busy && setOpen(false)} onConfirm={save}>
        {t('Бүртгэсний дараа засах боломжгүй бөгөөд мэдүүлэгчид харагдана. Дугаар:')} <strong className="mono">{f.officialRef}</strong>
      </Confirm>
    </Card>
  );
}

/* ───────────── Албан ёсны үр дүн (F11) ───────────── */

const OUTCOMES = [
  ['PENDING', t('Шийдвэр хүлээж байна')],
  ['APPROVED', t('Зөвшөөрсөн')],
  ['REFUSED', t('Татгалзсан')],
];
export const OfficialResultNote = () => (
  <Alert tone="info" title={t('Энэ нь системийн шийдвэр биш')}>
    {t(
      'Энд зөвхөн таны Korea Visa Portal-аас өөрөө харсан үр дүнг бүртгэнэ. Систем визийн шийдвэр гаргахгүй, таахгүй. Нотолгоо файлгүй бичлэг “Баталгаажаагүй” хэвээр харагдана.',
    )}
  </Alert>
);
function VerificationBadge({ r }) {
  if (!r.verification) return <Badge tone="muted">{t('Баталгаажаагүй')}</Badge>;
  return r.verification.verdict === 'MATCHES' ? (
    <Badge tone="ok">{t('Оператор нотолгоотой тулгасан')}</Badge>
  ) : (
    <Badge tone="warn">{t('Нотолгоотой таараагүй')}</Badge>
  );
}

/**
 * Албан үр дүнгийн жагсаалт. mode="applicant": шинэ бичлэг нэмэх; mode="operator": нотолгоотой бичлэгийг тулгах.
 * Аль ч горимд мэдүүлэгчийн бичлэгийг засах/устгах үйлдэлгүй.
 */
export function OfficialResults({ app, mode, onChanged, onOpen }) {
  const results = app.officialResults || [];
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(null);
  return (
    <Card>
      <div className="between">
        <h2>{t('Албан ёсны үр дүн')}</h2>
        {mode === 'applicant' && (
          <Button variant="ghost" className="btn-sm" onClick={() => setAdding(true)}>
            {t('Үр дүн бүртгэх')}
          </Button>
        )}
      </div>
      {results.length === 0 ? (
        <p className="muted">{t('Шалгаагүй — үр дүн бүртгэгдээгүй байна.')}</p>
      ) : (
        <ol className="timeline">
          {results.map((r) => (
            <li key={r.entryNo} className={r.verification?.verdict === 'MATCHES' ? 'ok' : 'warn'}>
              <div className="between">
                <strong>
                  #{r.entryNo} · {translateServer(r.outcomeLabel)}
                </strong>
                <VerificationBadge r={r} />
              </div>
              <div className="small muted">
                {t('Шалгасан')} {fmtDate(r.checkedOn)} {t('· эх сурвалж:')} {r.source}
                {r.sourceUrl && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {t('холбоос ↗')}
                    </a>
                  </>
                )}
              </div>
              {r.evidence && (
                <div>
                  {t('Нотолгоо:')} <FileOpenButton doc={asEvidence(r.evidence)} onOpen={onOpen} />
                </div>
              )}
              {r.verification && (
                <div className="small muted">
                  {r.verification.operatorName} · {fmtDateTime(r.verification.verifiedAt)}
                  {r.verification.note && ` — ${r.verification.note}`}
                </div>
              )}
              {mode === 'operator' && r.evidence && !r.verification && (
                <div className="mt">
                  <Button variant="ghost" className="btn-sm" onClick={() => setVerifying(r)}>
                    {t('Нотолгоотой тулгах')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="small muted mb0">
        {t('Мэдүүлэгчийн мэдээлсэн үр дүн. Систем визийн шийдвэр гаргахгүй; бичлэгийг засах, устгахгүй — залруулга бол шинэ бичлэг нэмнэ.')}
      </p>
      {adding && (
        <RecordResultModal
          publicId={app.publicId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
      {verifying && (
        <VerifyModal
          publicId={app.publicId}
          result={verifying}
          onClose={() => setVerifying(null)}
          onDone={() => {
            setVerifying(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
function RecordResultModal({ publicId, onClose, onDone }) {
  const toast = useToast();
  const [key] = useState(uuid);
  const [f, setF] = useState({
    outcome: '',
    checkedOn: todayIso(),
    source: 'Korea Visa Portal',
    sourceUrl: '',
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({
      ...x,
      [k]: e.target.value,
    }));
  async function save() {
    const fe = {};
    if (!f.outcome) fe.outcome = t('Үр дүнгээ сонгоно уу.');
    if (!f.checkedOn) fe.checkedOn = t('Огноо заавал.');
    if (f.source.trim().length < 2) fe.source = t('Эх сурвалжаа бичнэ үү.');
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      Object.entries({
        ...f,
        idempotencyKey: key,
      }).forEach(([k, v]) => form.append(k, v));
      if (file) form.append('file', file);
      await api.upload(`/api/app/applications/${publicId}/official-results`, form);
      toast(t('Үр дүн бүртгэгдлээ.'));
      onDone();
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={t('Албан ёсны үр дүн бүртгэх')}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('Болих')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('Бүртгэх')}
          </Button>
        </>
      }
    >
      <OfficialResultNote />
      {err && !Object.keys(err.fields || {}).length && <Alert tone="danger">{err.message}</Alert>}
      <Field label={t('Порталд харагдсан үр дүн')} htmlFor="or-outcome" error={errors.outcome} required>
        <select id="or-outcome" value={f.outcome} onChange={set('outcome')}>
          <option value="">{t('— сонгох —')}</option>
          {OUTCOMES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('Шалгасан огноо')} htmlFor="or-date" error={errors.checkedOn} required>
        <input id="or-date" type="date" max={todayIso()} value={f.checkedOn} onChange={set('checkedOn')} />
      </Field>
      <Field label={t('Эх сурвалж')} htmlFor="or-source" error={errors.source} required>
        <input id="or-source" value={f.source} onChange={set('source')} maxLength={150} />
      </Field>
      <Field
        label={t('Холбоос (HTTPS, сонголттой)')}
        htmlFor="or-url"
        error={errors.sourceUrl}
        hint={t('Хувийн мэдээлэлтэй URL бүү оруулаарай')}
      >
        <input id="or-url" value={f.sourceUrl} onChange={set('sourceUrl')} placeholder="https://www.visa.go.kr/…" />
      </Field>
      <Field label={t('Нотолгоо (дэлгэцийн зураг, PDF — сонголттой)')} htmlFor="or-file">
        <input
          id="or-file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Field>
      <p className="small muted mb0">{t('Бүртгэсэн бичлэгийг засах, устгах боломжгүй. Порталын нууц үгээ энд хэзээ ч бүү оруулаарай.')}</p>
    </Modal>
  );
}
function VerifyModal({ publicId, result, onClose, onDone }) {
  const toast = useToast();
  const [verdict, setVerdict] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  async function save() {
    const fe = {};
    if (!verdict) fe.verdict = t('Тулгалтын дүнг сонгоно уу.');
    if (verdict === 'MISMATCH' && !note.trim()) fe.note = t('Таараагүй бол шалтгааныг бичнэ.');
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api.post(`/api/operator/applications/${publicId}/official-results/${result.entryNo}/verification`, {
        verdict,
        note,
      });
      toast(t('Тулгалт хадгалагдлаа.'));
      onDone();
    } catch (ex) {
      setErrors(
        ex.fields?.note
          ? ex.fields
          : {
              _: ex.message,
            },
      );
      if (ex.status === 409) onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={t('Бичлэг #{{v0}}-ийг нотолгоотой тулгах', {
        v0: result.entryNo,
      })}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('Болих')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('Хадгалах')}
          </Button>
        </>
      }
    >
      <p
        className="small muted"
        style={{
          marginTop: 0,
        }}
      >
        {t('Мэдүүлэгчийн бүртгэсэн “')}
        {translateServer(result.outcomeLabel)}
        {t('” нь хавсаргасан нотолгоотой таарч байгаа эсэхийг л тэмдэглэнэ. Энэ нь визийн шийдвэр биш; мэдүүлэгчийн бичлэг өөрчлөгдөхгүй.')}
      </p>
      <fieldset
        style={{
          border: 0,
          padding: 0,
          margin: '0 0 14px',
        }}
      >
        <legend className="small muted">{t('Тулгалт')}</legend>
        <div className="radio-row">
          <label className="radio">
            <input type="radio" name="vd" checked={verdict === 'MATCHES'} onChange={() => setVerdict('MATCHES')} />{' '}
            {t('Нотолгоотой таарч байна')}
          </label>
          <label className="radio">
            <input type="radio" name="vd" checked={verdict === 'MISMATCH'} onChange={() => setVerdict('MISMATCH')} /> {t('Таараагүй')}
          </label>
        </div>
        {errors.verdict && <div className="field-error">{errors.verdict}</div>}
      </fieldset>
      <Field label={t('Тайлбар')} htmlFor="vd-note" error={errors.note} hint={verdict === 'MISMATCH' ? t('Заавал') : t('Сонголттой')}>
        <textarea id="vd-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
      </Field>
      {errors._ && <Alert tone="danger">{errors._}</Alert>}
    </Modal>
  );
}
