import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uuid } from '../../api.js';
import { Page, Card, Button, Field, Alert, ErrorBox, fmtBytes } from '../../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const MAX_FILES = 10;

// Үе 1.3 — Өмнөх мэдүүлэг нэмэх (тайлан 4.5). Давхар дарахад давхар бичлэг үүсэхгүй (idempotency).
export default function ImportNew() {
  const navigate = useNavigate();
  const [key] = useState(uuid);
  const [f, setF] = useState({
    countryName: 'БНСУ',
    visaCategory: '',
    appliedOn: '',
    authority: '',
    officialRef: '',
    outcome: 'NOT_CHECKED',
    note: '',
  });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    const fe = {};
    if (f.countryName.trim().length < 2) fe.countryName = 'Улсын нэр оруулна уу.';
    if (!f.visaCategory.trim()) fe.visaCategory = 'Визийн ангилал оруулна уу.';
    if (!f.appliedOn) fe.appliedOn = 'Огноо заавал.';
    else if (f.appliedOn > today()) fe.appliedOn = 'Ирээдүйн огноо байж болохгүй.';
    if (files.length > MAX_FILES) fe.files = `Хамгийн ихдээ ${MAX_FILES} файл.`;
    setErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      Object.entries({ ...f, idempotencyKey: key }).forEach(([k, v]) => form.append(k, v));
      files.forEach((x) => form.append('files', x));
      const r = await api.upload('/api/app/imports', form);
      navigate(`/app/imports/${r.publicId}`, { replace: true });
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Өмнөх мэдүүлэг', to: '/app/imports' }, { label: 'Нэмэх' }]}
      title="Өмнөх мэдүүлэг нэмэх"
      subtitle="Системээс гадуур өгсөн мэдүүлгийнхээ мэдээлэл, баримтыг архивтаа хадгална"
    >
      <Alert tone="info">
        Энэ бичлэг <strong>импортолсон, баталгаажаагүй</strong> гэж тэмдэглэгдэнэ. Оператор хянахгүй бөгөөд ЭСЯ-нд мэдүүлэг илгээхгүй.
        Нэмсний дараа засах боломжгүй (шаардлагатай бол устгаад дахин нэмнэ).
      </Alert>
      {err && !Object.keys(err.fields || {}).length && <ErrorBox error={err} />}
      <form onSubmit={save} noValidate>
        <Card>
          <div className="form-grid">
            <Field label="Улс" htmlFor="im-country" error={errors.countryName} required>
              <input id="im-country" value={f.countryName} onChange={set('countryName')} maxLength={100} />
            </Field>
            <Field label="Визийн ангилал" htmlFor="im-cat" error={errors.visaCategory} hint="ж: C-3-9" required>
              <input id="im-cat" value={f.visaCategory} onChange={set('visaCategory')} maxLength={60} />
            </Field>
            <Field label="Мэдүүлсэн огноо" htmlFor="im-date" error={errors.appliedOn} required>
              <input id="im-date" type="date" max={today()} value={f.appliedOn} onChange={set('appliedOn')} />
            </Field>
            <Field label="Хаана өгсөн" htmlFor="im-auth" error={errors.authority} hint="ж: KVAC, ЭСЯ">
              <input id="im-auth" value={f.authority} onChange={set('authority')} maxLength={150} />
            </Field>
            <Field label="Хүлээн авсан дугаар" htmlFor="im-ref" error={errors.officialRef}>
              <input id="im-ref" value={f.officialRef} onChange={set('officialRef')} maxLength={64} />
            </Field>
            <Field label="Үр дүн (таны мэдээлснээр)" htmlFor="im-out" error={errors.outcome}>
              <select id="im-out" value={f.outcome} onChange={set('outcome')}>
                <option value="NOT_CHECKED">Шалгаагүй</option>
                <option value="PENDING">Шийдвэр хүлээж байна</option>
                <option value="APPROVED">Зөвшөөрсөн</option>
                <option value="REFUSED">Татгалзсан</option>
              </select>
            </Field>
            <Field label="Тэмдэглэл" htmlFor="im-note" className="span-2">
              <textarea id="im-note" value={f.note} onChange={set('note')} maxLength={4000} />
            </Field>
            <Field
              label={`Баримт (PDF, JPG, PNG · файл ≤10 MB · ${MAX_FILES} хүртэл)`}
              htmlFor="im-files"
              error={errors.files}
              className="span-2"
            >
              <input
                id="im-files"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </Field>
          </div>
          {files.length > 0 && (
            <ul className="small" style={{ paddingLeft: 18 }}>
              {files.map((x) => (
                <li key={x.name}>
                  {x.name} · {fmtBytes(x.size)}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="page-footer">
          <Button type="submit" loading={busy}>
            Хадгалах
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/app/imports')}>
            Болих
          </Button>
        </div>
      </form>
    </Page>
  );
}
