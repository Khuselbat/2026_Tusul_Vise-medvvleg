import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Field, Button, Alert, ErrorBox, Skeleton, Confirm, useAsync, Empty, LinkButton } from '../../components/ui.jsx';
import { Steps } from '../../components/shared.jsx';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  familyName: '', givenName: '', birthDate: '', nationalityCode: 'MN', passportNumber: '', passportExpiresOn: '',
  contactEmail: '', contactPhone: '', travelPurpose: '', intendedEntryOn: '', intendedExitOn: '',
  extraFields: { occupation: '', homeAddress: '', stayAddress: '' },
};

/** Клиент талын шалгалт (сервер дээр ижил шалгалт дахин хийгдэнэ) */
function validate(f) {
  const e = {};
  const req = ['familyName', 'givenName', 'birthDate', 'nationalityCode', 'passportNumber', 'passportExpiresOn', 'contactEmail', 'contactPhone', 'travelPurpose', 'intendedEntryOn', 'intendedExitOn'];
  req.forEach((k) => { if (!String(f[k] || '').trim()) e[k] = 'Заавал бөглөнө.'; });
  if (f.familyName && !/^[A-Za-z][A-Za-z\s'-]*$/.test(f.familyName.trim())) e.familyName = 'Паспорт дээрх латин үсгээр бичнэ үү.';
  if (f.givenName && !/^[A-Za-z][A-Za-z\s'-]*$/.test(f.givenName.trim())) e.givenName = 'Паспорт дээрх латин үсгээр бичнэ үү.';
  if (f.birthDate && f.birthDate > today()) e.birthDate = 'Төрсөн огноо ирээдүйд байж болохгүй.';
  if (f.passportNumber && !/^[A-Za-z0-9]{6,12}$/.test(f.passportNumber.trim())) e.passportNumber = 'Паспортын дугаар 6–12 латин үсэг, тоо.';
  if (f.passportExpiresOn && f.passportExpiresOn <= today()) e.passportExpiresOn = 'Паспортын хугацаа дууссан байна.';
  if (f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) e.contactEmail = 'Имэйлийн хэлбэр буруу байна.';
  if (f.intendedEntryOn && f.intendedEntryOn < today()) e.intendedEntryOn = 'Орох огноо өнгөрсөн байна.';
  if (f.intendedEntryOn && f.intendedExitOn && f.intendedExitOn < f.intendedEntryOn) e.intendedExitOn = 'Гарах огноо орох огнооноос хойш байна.';
  if (!e.passportExpiresOn && f.passportExpiresOn && f.intendedExitOn && f.passportExpiresOn <= f.intendedExitOn) e.passportExpiresOn = 'Паспорт аяллын хугацаанд хүчинтэй байх ёстой.';
  return e;
}

// Зураг 43 Мэдүүлгийн анкет бөглөх
export default function NewForm() {
  const [sp] = useSearchParams();
  const draftRef = sp.get('draft');
  const versionId = sp.get('version');
  const copyFrom = sp.get('copyFrom');
  const navigate = useNavigate();
  const [key] = useState(uuid);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const ctx = useAsync(async () => {
    if (draftRef) {
      const { draft } = await api.get(`/api/app/drafts/${draftRef}`);
      return { visa: { ...draft.visa, canApply: draft.canSubmit, blockReason: draft.blockReason }, draft };
    }
    if (versionId) {
      const { visa } = await api.get(`/api/visas/${versionId}`);
      const copy = copyFrom ? (await api.get(`/api/app/applications/${copyFrom}/form-copy`)).form : null;
      return { visa, copy };
    }
    const { visas } = await api.get('/api/visas');
    return { choices: visas.filter((v) => v.canApply) };
  }, [draftRef, versionId, copyFrom]);

  useEffect(() => {
    const src = ctx.data?.draft?.form || ctx.data?.copy;
    if (src) setForm({ ...EMPTY, ...src, extraFields: { ...EMPTY.extraFields, ...(src.extraFields || {}) }, intendedEntryOn: src.intendedEntryOn || '', intendedExitOn: src.intendedExitOn || '' });
  }, [ctx.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setX = (k) => (e) => setForm((f) => ({ ...f, extraFields: { ...f.extraFields, [k]: e.target.value } }));

  async function next(e) {
    e.preventDefault();
    const fe = validate(form);
    setErrors(fe); setErr(null);
    if (Object.keys(fe).length) { document.querySelector('.has-error input')?.focus(); return; }
    setBusy(true);
    try {
      let ref = draftRef;
      if (!ref) ref = (await api.post('/api/app/drafts', { versionId: Number(versionId), idempotencyKey: key })).publicId;
      await api.put(`/api/app/drafts/${ref}/form`, form);
      navigate(`/app/new/documents?draft=${ref}`);
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex);
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (draftRef) { try { await api.del(`/api/app/drafts/${draftRef}`); } catch { /* */ } }
    navigate('/app');
  }

  if (ctx.loading) return <Page title="Мэдүүлгийн анкет бөглөх"><Skeleton rows={5} /></Page>;
  if (ctx.error) return <Page title="Мэдүүлгийн анкет бөглөх"><ErrorBox error={ctx.error} onRetry={ctx.reload} /></Page>;

  // Визийн төрөл сонгоогүй үед — сонголт
  if (ctx.data.choices) {
    return (
      <Page crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Шинэ мэдүүлэг' }]} title="Шинэ мэдүүлэг" subtitle="Мэдүүлэх визийн төрлөө сонгоно уу">
        {ctx.data.choices.length === 0 ? <Empty title="Одоогоор мэдүүлэг авах ангилал алга" /> : (
          <div className="grid grid-2">
            {ctx.data.choices.map((v) => (
              <Card key={v.versionId}>
                <div className="small muted">{v.country.name} · {v.code}</div>
                <h3 style={{ margin: '6px 0 12px' }}>{v.name}</h3>
                <div className="row-actions">
                  <LinkButton to={`/app/new?version=${v.versionId}`}>Сонгох</LinkButton>
                  <LinkButton variant="ghost" to={`/visas/${v.versionId}`}>Шаардлага унших</LinkButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Page>
    );
  }

  const v = ctx.data.visa;
  const F = (k, label, props = {}) => (
    <Field label={label} htmlFor={k} error={errors[k]} required={props.required !== false} hint={props.hint} className={props.className}>
      {props.textarea
        ? <textarea id={k} value={form[k]} onChange={set(k)} maxLength={500} />
        : <input id={k} type={props.type || 'text'} value={form[k]} onChange={set(k)} autoComplete={props.ac || 'off'} max={props.max} min={props.min}
          style={props.upper ? { textTransform: 'uppercase' } : undefined} />}
    </Field>
  );

  return (
    <Page crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Шинэ мэдүүлэг' }]} title="Мэдүүлгийн анкет бөглөх"
      subtitle={`${v.country?.name} · ${v.code} — ${v.name}`}>
      <Steps current={0} />
      {!v.canApply && <Alert tone="danger">{v.blockReason || 'Энэ ангилалд мэдүүлэг хүлээн авахгүй байна.'}</Alert>}
      {ctx.data.copy && <Alert tone="info">Өмнөх мэдүүлгээс анкетын мэдээллийг хуулсан. Паспорт, огноо зэрэг хугацаатай мэдээллийг дахин шалгана уу.</Alert>}
      {err && !Object.keys(err.fields || {}).length && <ErrorBox error={err} />}
      <form onSubmit={next} noValidate>
        <Card>
          <p className="small muted" style={{ marginTop: 0 }}>Албан ёсны анкетыг англи хэлээр бөглөнө — нэрийг паспорт дээрх латин бичлэгээр оруулна уу.</p>
          <div className="form-grid">
            {F('familyName', 'Овог (Surname)', { upper: true })}
            {F('givenName', 'Нэр (Given name)', { upper: true })}
            {F('birthDate', 'Төрсөн огноо', { type: 'date', max: today() })}
            {F('nationalityCode', 'Иргэншил (ISO код)', { upper: true, hint: 'ж: MN' })}
            {F('passportNumber', 'Паспортын дугаар', { upper: true, hint: 'Сервер дээр шифрлэж хадгална' })}
            {F('passportExpiresOn', 'Паспорт дуусах огноо', { type: 'date', min: today() })}
            {F('contactEmail', 'Имэйл', { type: 'email', ac: 'email' })}
            {F('contactPhone', 'Утас', { type: 'tel', ac: 'tel', hint: 'ж: +976 9911 2233' })}
            {F('intendedEntryOn', 'Орох огноо', { type: 'date', min: today() })}
            {F('intendedExitOn', 'Гарах огноо', { type: 'date', min: form.intendedEntryOn || today() })}
            {F('travelPurpose', 'Аяллын зорилго', { textarea: true, className: 'span-2' })}
            <Field label="Ажил эрхлэлт" htmlFor="occ"><input id="occ" value={form.extraFields.occupation} onChange={setX('occupation')} /></Field>
            <Field label="Байрлах хаяг (очих улсад)" htmlFor="stay"><input id="stay" value={form.extraFields.stayAddress} onChange={setX('stayAddress')} /></Field>
            <Field label="Гэрийн хаяг" htmlFor="home" className="span-2"><input id="home" value={form.extraFields.homeAddress} onChange={setX('homeAddress')} /></Field>
          </div>
        </Card>
        <div className="page-footer">
          <Button type="submit" loading={busy} disabled={!v.canApply}>Үргэлжлүүлэх</Button>
          <Button type="button" variant="ghost" onClick={() => setCancelOpen(true)}>Цуцлах</Button>
          <Link className="btn btn-link" to={`/visas/${v.versionId}`} target="_blank">Шаардлагыг харах ↗</Link>
        </div>
      </form>
      <Confirm open={cancelOpen} title="Мэдүүлгийг цуцлах уу?" tone="danger" confirmLabel="Тийм, цуцлах" onClose={() => setCancelOpen(false)} onConfirm={cancel}>
        Оруулсан мэдээлэл болон хавсаргасан файлууд устана. Энэ үйлдлийг буцаах боломжгүй.
      </Confirm>
    </Page>
  );
}
