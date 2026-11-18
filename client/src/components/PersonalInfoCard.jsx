// Мэдүүлэгчийн профайл: БНСУ-ын визийн анкетад давтан ашиглагдах хувийн мэдээллийг нэг удаа оруулна.
// Шинэ мэдүүлэг эхлүүлэхэд анкет эндээс автоматаар бөглөгдөнө (санал — хэрэглэгч шалгаж засна).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Alert, Button, Card, ErrorBox, Field, Skeleton, fmtDate, useAsync, useToast } from './ui.jsx';
import { t } from '../i18n.js';

const EMPTY = {
  familyName: '',
  givenName: '',
  birthDate: '',
  sex: '',
  nationalityCode: '',
  maritalStatus: '',
  passportNumber: '',
  passportIssuedOn: '',
  passportExpiresOn: '',
  contactEmail: '',
  contactPhone: '',
  homeAddress: '',
  occupation: '',
  employerOrSchool: '',
};

export const SEX_OPTIONS = () => [
  ['', t('— сонгох —')],
  ['M', t('Эрэгтэй')],
  ['F', t('Эмэгтэй')],
];
export const MARITAL_OPTIONS = () => [
  ['', t('— сонгох —')],
  ['SINGLE', t('Гэрлээгүй')],
  ['MARRIED', t('Гэрлэсэн')],
  ['DIVORCED', t('Салсан')],
  ['WIDOWED', t('Бэлэвсэн')],
];

/** Хугацааны анхааруулгын мөр (профайл, баримтын сан) */
export function ExpiryWarnings({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <Alert tone="warn" title={t('Хугацааны анхааруулга')}>
      <ul className="mb0">
        {warnings.map((w, i) => (
          <li key={i}>
            {w.kind === 'PASSPORT' ? t('Гадаад паспорт') : `${w.typeName}: ${w.name}`} —{' '}
            {w.status === 'EXPIRED'
              ? t('хугацаа {{v0}}-нд дууссан', { v0: fmtDate(w.date) })
              : t('хугацаа {{v0}}-нд дуусна', { v0: fmtDate(w.date) })}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

export default function PersonalInfoCard() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/profile'), []);
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, data.profile[k] ?? ''])) });
  }, [data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.put('/api/app/profile', form);
      toast(t('Хувийн мэдээлэл хадгалагдлаа.'));
      reload();
    } catch (ex) {
      setErrors(ex.fields || {});
      toast(ex.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const F = (k, label, props = {}) => (
    <Field label={label} htmlFor={`pf-${k}`} error={errors[k]} hint={props.hint}>
      <input id={`pf-${k}`} value={form[k]} onChange={set(k)} {...props.input} />
    </Field>
  );
  const S = (k, label, options) => (
    <Field label={label} htmlFor={`pf-${k}`} error={errors[k]}>
      <select id={`pf-${k}`} value={form[k]} onChange={set(k)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <Card className="mt">
      <h2>{t('Визийн мэдүүлэгт ашиглах хувийн мэдээлэл')}</h2>
      <p className="small muted">
        {t('Нэг удаа бөглөхөд шинэ мэдүүлгийн анкет автоматаар бөглөгдөнө. Зөвхөн танд харагдана; паспортын дугаар шифрлэгдэнэ.')}{' '}
        <Link to="/app/documents">{t('Бичиг баримтын сан →')}</Link>
      </p>
      {loading && <Skeleton rows={6} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <ExpiryWarnings warnings={data.warnings} />
          <form className="stack" onSubmit={save} noValidate>
            <p className="small muted mb0">{t('Нэрийг паспорт дээрх латин бичгээр оруулна.')}</p>
            <div className="grid grid-2">
              {F('familyName', t('Овог (Surname)'), { input: { autoComplete: 'family-name' } })}
              {F('givenName', t('Нэр (Given name)'), { input: { autoComplete: 'given-name' } })}
              {F('birthDate', t('Төрсөн огноо'), { input: { type: 'date' } })}
              {S('sex', t('Хүйс'), SEX_OPTIONS())}
              {F('nationalityCode', t('Иргэншил (ISO код)'), { hint: t('ж: MN'), input: { maxLength: 2 } })}
              {S('maritalStatus', t('Гэр бүлийн байдал'), MARITAL_OPTIONS())}
              {F('passportNumber', t('Паспортын дугаар'), { input: { autoComplete: 'off' } })}
              {F('passportIssuedOn', t('Паспорт олгосон огноо'), { input: { type: 'date' } })}
              {F('passportExpiresOn', t('Паспорт дуусах огноо'), { input: { type: 'date' } })}
              {F('contactPhone', t('Утас'), { hint: t('ж: +976 9911 2233'), input: { type: 'tel', autoComplete: 'tel' } })}
              {F('contactEmail', t('Холбоо барих имэйл'), {
                hint: t('Хоосон бол бүртгэлийн имэйл ({{v0}})', { v0: data.accountEmail }),
                input: { type: 'email', autoComplete: 'email' },
              })}
              {F('occupation', t('Ажил эрхлэлт'))}
              {F('employerOrSchool', t('Ажлын газар / сургууль'))}
              {F('homeAddress', t('Гэрийн хаяг'), { input: { autoComplete: 'street-address' } })}
            </div>
            {data.profile.updatedAt && (
              <p className="small muted mb0">{t('Сүүлд хадгалсан: {{v0}}', { v0: fmtDate(data.profile.updatedAt) })}</p>
            )}
            <div>
              <Button type="submit" loading={busy}>
                {t('Хувийн мэдээлэл хадгалах')}
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
