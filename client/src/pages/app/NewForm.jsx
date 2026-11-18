import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, uuid } from '../../api.js';
import {
  Page,
  Card,
  Field,
  Button,
  Alert,
  ErrorBox,
  Skeleton,
  Confirm,
  useAsync,
  Empty,
  LinkButton,
  fmtDateTime,
} from '../../components/ui.jsx';
import { Steps } from '../../components/shared.jsx';
import { SEX_OPTIONS, MARITAL_OPTIONS } from '../../components/PersonalInfoCard.jsx';
import { t } from '../../i18n.js';
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  familyName: '',
  givenName: '',
  birthDate: '',
  nationalityCode: 'MN',
  passportNumber: '',
  passportExpiresOn: '',
  contactEmail: '',
  contactPhone: '',
  travelPurpose: '',
  intendedEntryOn: '',
  intendedExitOn: '',
  extraFields: {
    occupation: '',
    homeAddress: '',
    stayAddress: '',
    sex: '',
    maritalStatus: '',
    passportIssuedOn: '',
    employerOrSchool: '',
  },
};

/** Клиент талын шалгалт (сервер дээр ижил шалгалт дахин хийгдэнэ) */
function validate(f) {
  const e = {};
  const req = [
    'familyName',
    'givenName',
    'birthDate',
    'nationalityCode',
    'passportNumber',
    'passportExpiresOn',
    'contactEmail',
    'contactPhone',
    'travelPurpose',
    'intendedEntryOn',
    'intendedExitOn',
  ];
  req.forEach((k) => {
    if (!String(f[k] || '').trim()) e[k] = t('Заавал бөглөнө.');
  });
  if (f.familyName && !/^[A-Za-z][A-Za-z\s'-]*$/.test(f.familyName.trim())) e.familyName = t('Паспорт дээрх латин үсгээр бичнэ үү.');
  if (f.givenName && !/^[A-Za-z][A-Za-z\s'-]*$/.test(f.givenName.trim())) e.givenName = t('Паспорт дээрх латин үсгээр бичнэ үү.');
  if (f.birthDate && f.birthDate > today()) e.birthDate = t('Төрсөн огноо ирээдүйд байж болохгүй.');
  if (f.passportNumber && !/^[A-Za-z0-9]{6,12}$/.test(f.passportNumber.trim()))
    e.passportNumber = t('Паспортын дугаар 6–12 латин үсэг, тоо.');
  if (f.passportExpiresOn && f.passportExpiresOn <= today()) e.passportExpiresOn = t('Паспортын хугацаа дууссан байна.');
  if (f.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) e.contactEmail = t('Имэйлийн хэлбэр буруу байна.');
  if (f.intendedEntryOn && f.intendedEntryOn < today()) e.intendedEntryOn = t('Орох огноо өнгөрсөн байна.');
  if (f.intendedEntryOn && f.intendedExitOn && f.intendedExitOn < f.intendedEntryOn)
    e.intendedExitOn = t('Гарах огноо орох огнооноос хойш байна.');
  if (!e.passportExpiresOn && f.passportExpiresOn && f.intendedExitOn && f.passportExpiresOn <= f.intendedExitOn)
    e.passportExpiresOn = t('Паспорт аяллын хугацаанд хүчинтэй байх ёстой.');
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
  // Профайлаас автоматаар бөглөсөн талбарууд (санал — хэрэглэгч засвал тэмдэг арилна)
  const [prefilled, setPrefilled] = useState(() => new Set());
  // Үе 4: автомат хадгалалт (серверт шифрлэгдэнэ)
  const createdRef = useRef(null);
  const touched = useRef(false);
  const [save, setSave] = useState({
    status: 'idle',
    at: null,
  });
  const currentRef = () => draftRef || createdRef.current;
  const ctx = useAsync(async () => {
    const loadPrefill = () => api.get('/api/app/profile/prefill').catch(() => null);
    if (draftRef) {
      const { draft } = await api.get(`/api/app/drafts/${draftRef}`);
      const prefill = !draft.form && !draft.autosave ? await loadPrefill() : null;
      return {
        visa: {
          ...draft.visa,
          canApply: draft.canSubmit,
          blockReason: draft.blockReason,
        },
        draft,
        prefill,
      };
    }
    if (versionId) {
      const { visa } = await api.get(`/api/visas/${versionId}`);
      const copy = copyFrom ? (await api.get(`/api/app/applications/${copyFrom}/form-copy`)).form : null;
      return {
        visa,
        copy,
        prefill: copy ? null : await loadPrefill(),
      };
    }
    const { visas } = await api.get('/api/visas');
    return {
      choices: visas.filter((v) => v.canApply),
    };
  }, [draftRef, versionId, copyFrom]);
  useEffect(() => {
    // Автомат хадгалалт байвал (эцсийн хадгалалтаас шинэ) түүнийг сэргээнэ
    const auto = ctx.data?.draft?.autosave;
    if (auto)
      setSave({
        status: 'restored',
        at: auto.savedAt,
      });
    const pf = ctx.data?.prefill;
    const fromProfile = !auto?.form && !ctx.data?.draft?.form && !ctx.data?.copy && pf?.filled?.length;
    const src = auto?.form || ctx.data?.draft?.form || ctx.data?.copy || (fromProfile ? pf.form : null);
    setPrefilled(new Set(fromProfile ? pf.filled : []));
    if (src)
      setForm({
        ...EMPTY,
        ...src,
        extraFields: {
          ...EMPTY.extraFields,
          ...(src.extraFields || {}),
        },
        intendedEntryOn: src.intendedEntryOn || '',
        intendedExitOn: src.intendedExitOn || '',
      });
  }, [ctx.data]);
  const unmark = (k) =>
    setPrefilled((p) => {
      if (!p.has(k)) return p;
      const n = new Set(p);
      n.delete(k);
      return n;
    });
  const set = (k) => (e) => {
    touched.current = true;
    unmark(k);
    setForm((f) => ({
      ...f,
      [k]: e.target.value,
    }));
  };
  const setX = (k) => (e) => {
    touched.current = true;
    unmark(`extraFields.${k}`);
    setForm((f) => ({
      ...f,
      extraFields: {
        ...f.extraFields,
        [k]: e.target.value,
      },
    }));
  };
  const canAutosave = !!(draftRef || (versionId && ctx.data?.visa?.canApply));
  async function autosave(data) {
    if (!navigator.onLine) {
      setSave((s) => ({
        ...s,
        status: 'offline',
      }));
      return;
    }
    setSave((s) => ({
      ...s,
      status: 'saving',
    }));
    try {
      let ref = currentRef();
      if (!ref) {
        ref = (
          await api.post('/api/app/drafts', {
            versionId: Number(versionId),
            idempotencyKey: key,
          })
        ).publicId;
        createdRef.current = ref;
        // Дахин ачаалахад ноорог сэргээгдэхийн тулд хаягийг шинэчилнэ (хуудсыг дахин зурахгүйгээр)
        window.history.replaceState(window.history.state, '', `/app/new?draft=${ref}`);
      }
      const r = await api.put(`/api/app/drafts/${ref}/autosave`, data);
      setSave({
        status: 'saved',
        at: r.savedAt,
      });
    } catch {
      setSave((s) => ({
        ...s,
        status: navigator.onLine ? 'error' : 'offline',
      }));
    }
  }

  // Бичихээ зогсоосноос 1.5 сек дараа хадгална; сүлжээ сэргэхэд дахин оролдоно
  useEffect(() => {
    if (!touched.current || !canAutosave) return undefined;
    const tv = setTimeout(() => autosave(form), 1500);
    return () => clearTimeout(tv);
  }, [form, canAutosave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const retry = () => touched.current && canAutosave && autosave(form);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [form, canAutosave]); // eslint-disable-line react-hooks/exhaustive-deps

  async function next(e) {
    e.preventDefault();
    const fe = validate(form);
    setErrors(fe);
    setErr(null);
    if (Object.keys(fe).length) {
      document.querySelector('.has-error input')?.focus();
      return;
    }
    setBusy(true);
    try {
      let ref = currentRef();
      if (!ref)
        ref = (
          await api.post('/api/app/drafts', {
            versionId: Number(versionId),
            idempotencyKey: key,
          })
        ).publicId;
      await api.put(`/api/app/drafts/${ref}/form`, form);
      navigate(`/app/new/documents?draft=${ref}`);
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (currentRef()) {
      try {
        await api.del(`/api/app/drafts/${currentRef()}`);
      } catch {
        /* */
      }
    }
    navigate('/app');
  }
  if (ctx.loading)
    return (
      <Page title={t('Мэдүүлгийн анкет бөглөх')}>
        <Skeleton rows={5} />
      </Page>
    );
  if (ctx.error)
    return (
      <Page title={t('Мэдүүлгийн анкет бөглөх')}>
        <ErrorBox error={ctx.error} onRetry={ctx.reload} />
      </Page>
    );

  // Визийн төрөл сонгоогүй үед — сонголт
  if (ctx.data.choices) {
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
        title={t('Шинэ мэдүүлэг')}
        subtitle={t('Мэдүүлэх визийн төрлөө сонгоно уу')}
      >
        {ctx.data.choices.length === 0 ? (
          <Empty title={t('Одоогоор мэдүүлэг авах ангилал алга')} />
        ) : (
          <div className="grid grid-2">
            {ctx.data.choices.map((v) => (
              <Card key={v.versionId}>
                <div className="small muted">
                  {v.country.name} · {v.code}
                </div>
                <h3
                  style={{
                    margin: '6px 0 8px',
                  }}
                >
                  {v.name}
                </h3>
                {v.description && <p className="small mb0 clamp-3">{v.description}</p>}
                <p className="small muted">
                  {t('{{v0}} материал', { v0: v.requirementCount })}
                  {v.verifiedAt && ` · ${t('шалгасан {{v0}}', { v0: String(v.verifiedAt).slice(0, 10) })}`}
                </p>
                <div className="row-actions">
                  <LinkButton to={`/app/new?version=${v.versionId}`}>{t('Сонгох')}</LinkButton>
                  <LinkButton variant="ghost" to={`/visas/${v.versionId}`}>
                    {t('Шаардлага унших')}
                  </LinkButton>
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
    <Field
      label={label}
      htmlFor={k}
      error={errors[k]}
      required={props.required !== false}
      hint={prefilled.has(k) ? [props.hint, t('Профайлаас бөглөсөн')].filter(Boolean).join(' · ') : props.hint}
      className={[props.className, prefilled.has(k) ? 'prefilled' : ''].filter(Boolean).join(' ')}
    >
      {props.textarea ? (
        <textarea id={k} value={form[k]} onChange={set(k)} maxLength={500} />
      ) : (
        <input
          id={k}
          type={props.type || 'text'}
          value={form[k]}
          onChange={set(k)}
          autoComplete={props.ac || 'off'}
          max={props.max}
          min={props.min}
          style={
            props.upper
              ? {
                  textTransform: 'uppercase',
                }
              : undefined
          }
        />
      )}
    </Field>
  );
  // Сонголттой нэмэлт талбар (extraFields)
  const X = (k, label, props = {}) => {
    const id = `x-${k}`;
    const mark = prefilled.has(`extraFields.${k}`);
    return (
      <Field
        label={label}
        htmlFor={id}
        error={errors[`extraFields.${k}`]}
        hint={mark ? t('Профайлаас бөглөсөн') : undefined}
        className={[props.className, mark ? 'prefilled' : ''].filter(Boolean).join(' ')}
      >
        {props.options ? (
          <select id={id} value={form.extraFields[k]} onChange={setX(k)}>
            {props.options.map(([val, l]) => (
              <option key={val} value={val}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <input id={id} type={props.type || 'text'} max={props.max} value={form.extraFields[k]} onChange={setX(k)} />
        )}
      </Field>
    );
  };
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
      title={t('Мэдүүлгийн анкет бөглөх')}
      subtitle={`${v.country?.name} · ${v.code} — ${v.name}`}
    >
      <Steps current={0} />
      {!v.canApply && <Alert tone="danger">{v.blockReason || t('Энэ ангилалд мэдүүлэг хүлээн авахгүй байна.')}</Alert>}
      {ctx.data.copy && (
        <Alert tone="info">
          {t('Өмнөх мэдүүлгээс анкетын мэдээллийг хуулсан. Паспорт, огноо зэрэг хугацаатай мэдээллийг дахин шалгана уу.')}
        </Alert>
      )}
      {prefilled.size > 0 && (
        <Alert tone="info">
          {t('Профайлаас {{v0}} талбар автоматаар бөглөгдлөө — энэ нь зөвхөн санал. Илгээхээс өмнө шалгаж, шаардлагатай бол засна уу.', {
            v0: prefilled.size,
          })}{' '}
          <Link to="/app/profile">{t('Профайл засах')}</Link>
        </Alert>
      )}
      {ctx.data.prefill?.passportExpired && (
        <Alert tone="warn">{t('Профайлд хадгалсан паспортын хугацаа дууссан байна — шинэ паспортын мэдээллээ оруулна уу.')}</Alert>
      )}
      {err && !Object.keys(err.fields || {}).length && <ErrorBox error={err} />}
      <form onSubmit={next} noValidate>
        <Card>
          <p
            className="small muted"
            style={{
              marginTop: 0,
            }}
          >
            {t('Албан ёсны анкетыг англи хэлээр бөглөнө — нэрийг паспорт дээрх латин бичлэгээр оруулна уу.')}
          </p>
          <div className="form-grid">
            {F('familyName', t('Овог (Surname)'), {
              upper: true,
            })}
            {F('givenName', t('Нэр (Given name)'), {
              upper: true,
            })}
            {F('birthDate', t('Төрсөн огноо'), {
              type: 'date',
              max: today(),
            })}
            {F('nationalityCode', t('Иргэншил (ISO код)'), {
              upper: true,
              hint: t('ж: MN'),
            })}
            {F('passportNumber', t('Паспортын дугаар'), {
              upper: true,
              hint: t('Сервер дээр шифрлэж хадгална'),
            })}
            {F('passportExpiresOn', t('Паспорт дуусах огноо'), {
              type: 'date',
              min: today(),
            })}
            {F('contactEmail', t('Имэйл'), {
              type: 'email',
              ac: 'email',
            })}
            {F('contactPhone', t('Утас'), {
              type: 'tel',
              ac: 'tel',
              hint: t('ж: +976 9911 2233'),
            })}
            {F('intendedEntryOn', t('Орох огноо'), {
              type: 'date',
              min: today(),
            })}
            {F('intendedExitOn', t('Гарах огноо'), {
              type: 'date',
              min: form.intendedEntryOn || today(),
            })}
            {F('travelPurpose', t('Аяллын зорилго'), {
              textarea: true,
              className: 'span-2',
            })}
            {X('sex', t('Хүйс'), { options: SEX_OPTIONS() })}
            {X('maritalStatus', t('Гэр бүлийн байдал'), { options: MARITAL_OPTIONS() })}
            {X('passportIssuedOn', t('Паспорт олгосон огноо'), { type: 'date', max: today() })}
            {X('occupation', t('Ажил эрхлэлт'))}
            {X('employerOrSchool', t('Ажлын газар / сургууль'))}
            {X('stayAddress', t('Байрлах хаяг (очих улсад)'))}
            {X('homeAddress', t('Гэрийн хаяг'), { className: 'span-2' })}
          </div>
        </Card>
        <div className="page-footer">
          <Button type="submit" loading={busy} disabled={!v.canApply}>
            {t('Үргэлжлүүлэх')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCancelOpen(true)}>
            {t('Цуцлах')}
          </Button>
          <Link className="btn btn-link" to={`/visas/${v.versionId}`} target="_blank">
            {t('Шаардлагыг харах ↗')}
          </Link>
        </div>
        <p className="small muted autosave-status" role="status" aria-live="polite">
          {
            {
              idle: '',
              saving: t('Хадгалж байна…'),
              saved: t('Ноорог автоматаар хадгалагдсан · {{v0}}', {
                v0: fmtDateTime(save.at),
              }),
              restored: t('Өмнө автоматаар хадгалсан ноорог сэргээгдлээ · {{v0}}', {
                v0: fmtDateTime(save.at),
              }),
              error: t('Автомат хадгалалт амжилтгүй. “Үргэлжлүүлэх” дарж хадгална уу.'),
              offline: t('Сүлжээ тасарсан — өөрчлөлт хадгалагдаагүй. Холболт сэргэхэд автоматаар хадгална.'),
            }[save.status]
          }
        </p>
      </form>
      <Confirm
        open={cancelOpen}
        title={t('Мэдүүлгийг цуцлах уу?')}
        tone="danger"
        confirmLabel={t('Тийм, цуцлах')}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
      >
        {t('Оруулсан мэдээлэл болон хавсаргасан файлууд устана. Энэ үйлдлийг буцаах боломжгүй.')}
      </Confirm>
    </Page>
  );
}
