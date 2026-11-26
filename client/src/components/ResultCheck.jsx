// Зочны нэг хуудасны ★ "Визийн хариу шалгах" (#check).
// Энэ систем визийн хариуг татаж/зохиож харуулахгүй (BR-09, CLAUDE.md §5, §7): маягт нь зөвхөн хөтөч дотор формат шалгаж,
// албан порталд оруулах мэдээллийг бэлдэнэ. Сервер рүү юу ч илгээхгүй, хадгалахгүй (localStorage ч биш) — хуудсыг хаахад устана.
// Порталыг /app/official-result-тэй ижил Confirm-оор шинэ цонхонд нээнэ (officialPortal.jsx).
import { useId, useState } from 'react';
import { Button, Field, Skeleton, DL } from './ui.jsx';
import Icon from './Icon.jsx';
import { resultNotice, ResultNotes, portalEnabled, usePortal } from './officialPortal.jsx';
import { t } from '../i18n.js';

const EMPTY = { type: '', by: 'PASSPORT', number: '', name: '', dob: '' };
// Паспортын дугаар: ICAO 9303 — латин том үсэг, цифр, ≤9 тэмдэгт. Хүлээн авсан дугаар: цифр/үсэг, 6–20.
const RE = {
  PASSPORT: /^[A-Z0-9]{6,9}$/,
  RECEIPT: /^[A-Z0-9-]{6,20}$/,
  name: /^[A-Z]+(?:[ '-][A-Z]+)*$/,
};
const today = () => new Date().toISOString().slice(0, 10);
const mask = (s) => (s.length <= 4 ? '•'.repeat(s.length) : `${s.slice(0, 2)}${'•'.repeat(s.length - 4)}${s.slice(-2)}`);

export function validate(v) {
  const e = {};
  if (!v.type) e.type = t('Мэдүүлгийн төрлөө сонгоно уу.');
  if (!v.number) e.number = t('Дугаараа оруулна уу.');
  else if (!RE[v.by].test(v.number))
    e.number =
      v.by === 'PASSPORT'
        ? t('Паспортын дугаар латин том үсэг, цифрээс бүрдэх 6–9 тэмдэгт байна (ж: E1234567).')
        : t('Хүлээн авсан дугаар 6–20 тэмдэгт (цифр, латин үсэг, зураас) байна.');
  if (!v.name) e.name = t('Англи нэрээ оруулна уу.');
  else if (v.name.length > 60 || !RE.name.test(v.name))
    e.name = t('Паспорт дээрх латин бичлэгээр, зөвхөн латин үсгээр бичнэ (ж: BAT BOLD).');
  if (!v.dob) e.dob = t('Төрсөн огноогоо оруулна уу.');
  else if (v.dob < '1900-01-01' || v.dob > today()) e.dob = t('Төрсөн огноо буруу байна.');
  return e;
}

export default function ResultCheck({ countries, visas, loading }) {
  const uid = useId();
  const id = (k) => `rc-${k}${uid.replace(/:/g, '')}`;
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [ready, setReady] = useState(null);
  const portal = usePortal();
  const country = countries.find(portalEnabled);
  const set = (k, val) => {
    setV((o) => ({ ...o, [k]: val }));
    if (errors[k]) setErrors((o) => ({ ...o, [k]: undefined }));
    setReady(null);
  };
  const submit = (ev) => {
    ev.preventDefault();
    const e = validate(v);
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(id(first === 'by' ? 'number' : first))?.focus();
      return;
    }
    setReady({ ...v });
  };
  const reset = () => {
    setV(EMPTY);
    setErrors({});
    setReady(null);
  };
  const typeLabel = (code) => (code === 'OTHER' ? t('Бусад / жагсаалтад байхгүй') : visas.find((x) => x.code === code)?.name || code);

  return (
    <div className="check-grid">
      <form className="check-form" onSubmit={submit} noValidate aria-describedby={id('privacy')}>
        <div className="form-grid">
          <Field
            label={t('Мэдүүлгийн төрөл')}
            htmlFor={id('type')}
            required
            error={errors.type}
            hint={t('Порталд сонгох визийн ангилал')}
            className="span-2"
          >
            {loading ? (
              <Skeleton rows={1} />
            ) : (
              <select id={id('type')} value={v.type} onChange={(e) => set('type', e.target.value)} aria-invalid={!!errors.type}>
                <option value="">{t('— Сонгох —')}</option>
                {visas.map((x) => (
                  <option key={x.versionId} value={x.code}>
                    {x.code} — {x.name}
                  </option>
                ))}
                <option value="OTHER">{t('Бусад / жагсаалтад байхгүй')}</option>
              </select>
            )}
          </Field>
          <fieldset className="field span-2 radio-field">
            <legend>{t('Хайх төрөл')}</legend>
            <div className="radio-row">
              {[
                ['PASSPORT', t('Паспортын дугаар')],
                ['RECEIPT', t('Хүлээн авсан дугаар')],
              ].map(([k, l]) => (
                <label key={k} className="radio">
                  <input type="radio" name={id('by')} value={k} checked={v.by === k} onChange={() => set('by', k)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label={v.by === 'PASSPORT' ? t('Паспортын дугаар') : t('Хүлээн авсан дугаар')}
            htmlFor={id('number')}
            required
            error={errors.number}
            hint={
              v.by === 'PASSPORT'
                ? t('Паспортын мэдээллийн хуудсан дээрх дугаар (ж: E1234567)')
                : t('Материал хүлээлгэн өгөхөд олгосон баримт дээрх дугаар. Дотоод лавлах дугаар (KR-…) биш.')
            }
          >
            <input
              id={id('number')}
              value={v.number}
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              maxLength={20}
              aria-invalid={!!errors.number}
              onChange={(e) => set('number', e.target.value.toUpperCase().replace(/\s/g, ''))}
            />
          </Field>
          <Field
            label={t('Англи нэр')}
            htmlFor={id('name')}
            required
            error={errors.name}
            hint={t('Паспорт дээрх латин бичлэгээр — овог, нэр (ж: BAT BOLD)')}
          >
            <input
              id={id('name')}
              value={v.name}
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              aria-invalid={!!errors.name}
              onChange={(e) => set('name', e.target.value.toUpperCase().replace(/\s+/g, ' ').trimStart())}
            />
          </Field>
          <Field label={t('Төрсөн огноо')} htmlFor={id('dob')} required error={errors.dob} hint={t('Паспорт дээрх огноо')}>
            <input
              id={id('dob')}
              type="date"
              min="1900-01-01"
              max={today()}
              value={v.dob}
              aria-invalid={!!errors.dob}
              onChange={(e) => set('dob', e.target.value)}
            />
          </Field>
        </div>
        <p id={id('privacy')} className="small muted check-privacy">
          <Icon name="shield" size={16} />
          <span>
            {t('Оруулсан мэдээлэл зөвхөн таны хөтөчид байна — манай сервер рүү илгээгдэхгүй, хадгалагдахгүй. Хуудсыг хаахад устана.')}
          </span>
        </p>
        <div className="row-actions">
          <Button type="submit">
            <Icon name="check" size={18} />
            {t('Хариу шалгахад бэлдэх')}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            {t('Цэвэрлэх')}
          </Button>
        </div>
        <div className="check-result" aria-live="polite">
          {ready && (
            <div className="check-ready" tabIndex={-1} ref={(el) => el?.focus()}>
              <h3>{t('Мэдээлэл бэлэн — албан порталаар шалгана уу')}</h3>
              <p className="small">{resultNotice()}</p>
              <DL
                items={[
                  [t('Мэдүүлгийн төрөл'), typeLabel(ready.type)],
                  [t('Хайх төрөл'), ready.by === 'PASSPORT' ? t('Паспортын дугаар') : t('Хүлээн авсан дугаар')],
                  [
                    t('Дугаар'),
                    <span key="n" className="mono">
                      {mask(ready.number)}
                    </span>,
                  ],
                  [t('Англи нэр'), ready.name],
                  [t('Төрсөн огноо'), ready.dob],
                ]}
              />
              <div className="row-actions">
                <Button type="button" disabled={!country} onClick={() => portal.ask(country)}>
                  {t('Албан порталаар шалгах ↗')}
                </Button>
              </div>
              {!country && <p className="small muted">{t('Портал холбоос тохируулаагүй.')}</p>}
            </div>
          )}
        </div>
      </form>
      <aside className="check-aside" aria-labelledby={id('aside')}>
        <h3 id={id('aside')}>{t('Порталд юу оруулах вэ')}</h3>
        <ol className="mini-steps">
          <li>
            <b aria-hidden>1</b>
            <span>{t('Мэдүүлгийн төрлөө сонгоно.')}</span>
          </li>
          <li>
            <b aria-hidden>2</b>
            <span>{t('Паспортын эсвэл хүлээн авсан дугаараа оруулна.')}</span>
          </li>
          <li>
            <b aria-hidden>3</b>
            <span>{t('Англи нэр, төрсөн огноогоо паспорт дээрх бичлэгтэй ижил оруулна.')}</span>
          </li>
        </ol>
        <Button type="button" variant="ghost" className="w-full" disabled={!country} onClick={() => portal.ask(country)}>
          {t('Албан порталаар шалгах ↗')}
        </Button>
        {country && (
          <p className="small muted mb0">
            {new URL(country.officialResultUrl).hostname} {t('— албан ёсны хариу шалгах хуудас')}
          </p>
        )}
        <h4>{t('Анхаарах')}</h4>
        <ResultNotes />
      </aside>
      {portal.dialog}
    </div>
  );
}
