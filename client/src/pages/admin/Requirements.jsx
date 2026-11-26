import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  useAsync,
  ErrorBox,
  Skeleton,
  Empty,
  Badge,
  Button,
  Modal,
  Field,
  Confirm,
  useToast,
  Alert,
  LinkButton,
  TableWrap,
} from '../../components/ui.jsx';
import { RequirementMeta, ORIGINAL_OR_COPY } from '../../components/shared.jsx';
import { t } from '../../i18n.js';
const EMPTY = {
  code: '',
  title: '',
  instructions: '',
  appliesTo: '',
  originalOrCopy: '',
  translationNote: '',
  isRequired: true,
  sortOrder: 10,
};

// Зураг 58 Бүрдүүлэх материалын шаардлага — зөвхөн нийтлээгүй хувилбарт засна
export default function Requirements() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/versions/${id}`), [id]);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  // Шаардлага ↔ профайлын баримтын төрөл (нийтэлсэн хувилбарт ч — зөвхөн автомат бөглөлтийн санал, audit-тай)
  const [mapFor, setMapFor] = useState(null);
  const [mapSel, setMapSel] = useState([]);
  const typeName = (code) => t(data?.documentTypes?.find((x) => x.code === code)?.name || code);
  async function saveMap() {
    setBusy(true);
    try {
      await api.put(`/api/admin/requirements/${mapFor.id}/document-types`, { typeCodes: mapSel });
      toast(t('Хадгалагдлаа.'));
      setMapFor(null);
      reload();
    } catch (ex) {
      toast(ex.message, 'danger');
    } finally {
      setBusy(false);
    }
  }
  const v = data?.version;
  const ro = !!v?.publishedAt;
  const open = (r) => {
    const maxSort = Math.max(0, ...(data?.requirements || []).map((x) => x.sortOrder));
    setEdit(r || {});
    setF(
      r
        ? {
            code: r.code,
            title: r.title,
            instructions: r.instructions || '',
            appliesTo: r.appliesTo || '',
            originalOrCopy: r.originalOrCopy || '',
            translationNote: r.translationNote || '',
            isRequired: r.isRequired,
            sortOrder: r.sortOrder,
          }
        : {
            ...EMPTY,
            sortOrder: maxSort + 10,
          },
    );
    setErrs({});
  };
  async function save() {
    const fe = {};
    if (!/^[A-Za-z0-9_-]+$/.test(f.code)) fe.code = t('Латин үсэг, тоо, _ -');
    if (f.title.trim().length < 2) fe.title = t('Нэр оруулна уу.');
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const body = {
        ...f,
        sortOrder: Number(f.sortOrder) || 0,
      };
      if (edit.id) await api.put(`/api/admin/requirements/${edit.id}`, body);
      else await api.post(`/api/admin/versions/${id}/requirements`, body);
      toast(t('Хадгалагдлаа.'));
      setEdit(null);
      reload();
    } catch (ex) {
      setErrs({
        ...ex.fields,
        _: Object.keys(ex.fields || {}).length ? '' : ex.message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/admin/requirements/${del.id}`);
      toast(t('Устгалаа.'), 'info');
      setDel(null);
      reload();
    } catch (ex) {
      toast(ex.message, 'danger');
      setDel(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Визийн төрөл'),
          to: '/admin/visa-types',
        },
        {
          label: v ? `${v.typeCode} v${v.versionNo}` : '…',
          to: `/admin/versions/${id}`,
        },
        {
          label: t('Шаардлага'),
        },
      ]}
      title={t('Бүрдүүлэх материалын шаардлага')}
      subtitle={v && `${v.countryName} · ${v.typeCode} · v${v.versionNo} — ${v.nameMn}`}
      actions={
        <>
          {!ro && <Button onClick={() => open(null)}>{t('Шаардлага нэмэх')}</Button>}
          <LinkButton variant="ghost" to={`/admin/versions/${id}`}>
            {t('Хувилбар руу')}
          </LinkButton>
        </>
      }
    >
      {ro && (
        <Alert tone="info">
          {t('Нийтэлсэн хувилбарын шаардлагыг засахгүй (зөвхөн уншина).')}{' '}
          <Link to={`/admin/versions/${id}`}>{t('Хуулж шинэ хувилбар үүсгэх')}</Link>
        </Alert>
      )}
      <Alert tone="warn">{t('Жишээ шаардлагыг бодит хууль зүйн шаардлага гэж үзэхгүй — эх сурвалжтай тулгаж оруулна.')}</Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.requirements.length === 0 ? (
          <Empty title={t('Шаардлага нэмээгүй')} action={!ro && <Button onClick={() => open(null)}>{t('Шаардлага нэмэх')}</Button>}>
            {t('Нийтлэхэд дор хаяж нэг шаардлага хэрэгтэй.')}
          </Empty>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('Дараалал')}</th>
                  <th>{t('Код')}</th>
                  <th>{t('Нэр')}</th>
                  <th>{t('Заавар')}</th>
                  <th>{t('Заавал')}</th>
                  <th>{t('Профайлын баримт')}</th>
                  {!ro && <th />}
                </tr>
              </thead>
              <tbody>
                {data.requirements.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sortOrder}</td>
                    <td className="mono">{r.code}</td>
                    <td>
                      <strong>{r.title}</strong>
                    </td>
                    <td
                      className="small muted"
                      style={{
                        maxWidth: 380,
                      }}
                    >
                      {r.instructions}
                      <RequirementMeta r={r} />
                    </td>
                    <td>{r.isRequired ? <Badge tone="info">{t('Заавал')}</Badge> : <Badge tone="muted">{t('Хамаарах бол')}</Badge>}</td>
                    <td className="small">
                      {(r.documentTypes || []).map(typeName).join(', ') || <span className="muted">—</span>}{' '}
                      <button
                        className="btn-link"
                        aria-label={t('{{v0}}: профайлын баримтын төрөл тохируулах', { v0: r.title })}
                        onClick={() => {
                          setMapFor(r);
                          setMapSel(r.documentTypes || []);
                        }}
                      >
                        {t('Тохируулах')}
                      </button>
                    </td>
                    {!ro && (
                      <td className="row-actions">
                        <button className="btn-link" onClick={() => open(r)}>
                          {t('Засах')}
                        </button>
                        <button className="btn-link danger" onClick={() => setDel(r)}>
                          {t('Устгах')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
      <Modal
        open={!!mapFor}
        title={mapFor ? t('Профайлын баримт — {{v0}}', { v0: mapFor.title }) : ''}
        onClose={() => setMapFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMapFor(null)}>
              {t('Цуцлах')}
            </Button>
            <Button loading={busy} onClick={saveMap}>
              {t('Хадгалах')}
            </Button>
          </>
        }
      >
        <p className="small muted">
          {t(
            'Мэдүүлэгчийн бичиг баримтын сангаас энэ шаардлагад автоматаар хуулж хавсаргах баримтын төрлүүд. Нийтэд харагдах агуулга өөрчлөгдөхгүй.',
          )}
        </p>
        <fieldset className="stack">
          <legend className="sr-only">{t('Баримтын төрөл')}</legend>
          {(data?.documentTypes || []).map((dt) => (
            <label key={dt.code} className="check">
              <input
                type="checkbox"
                checked={mapSel.includes(dt.code)}
                onChange={(e) => setMapSel(e.target.checked ? [...mapSel, dt.code] : mapSel.filter((x) => x !== dt.code))}
              />
              <span>{t(dt.name)}</span>
            </label>
          ))}
        </fieldset>
      </Modal>
      <Modal
        open={!!edit}
        title={edit?.id ? t('Шаардлага засах') : t('Шаардлага нэмэх')}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              {t('Цуцлах')}
            </Button>
            <Button loading={busy} onClick={save}>
              {t('Хадгалах')}
            </Button>
          </>
        }
      >
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label={t('Код')} htmlFor="c" error={errs.code} hint={t('Нэг хувилбарт давтагдахгүй, ж: PASSPORT_COPY')} required>
            <input
              id="c"
              style={{
                textTransform: 'uppercase',
              }}
              value={f.code}
              onChange={(e) =>
                setF({
                  ...f,
                  code: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Нэр')} htmlFor="t" error={errs.title} required>
            <input
              id="t"
              value={f.title}
              onChange={(e) =>
                setF({
                  ...f,
                  title: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Заавар')} htmlFor="i">
            <textarea
              id="i"
              value={f.instructions}
              onChange={(e) =>
                setF({
                  ...f,
                  instructions: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Хэнд хамаарах')} htmlFor="ap" error={errs.appliesTo} hint={t('ж: Бүх мэдүүлэгч; гэрлэсэн бол')}>
            <input
              id="ap"
              maxLength={300}
              value={f.appliesTo}
              onChange={(e) =>
                setF({
                  ...f,
                  appliesTo: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Эх хувь / хуулбар')} htmlFor="oc" error={errs.originalOrCopy}>
            <select
              id="oc"
              value={f.originalOrCopy}
              onChange={(e) =>
                setF({
                  ...f,
                  originalOrCopy: e.target.value,
                })
              }
            >
              <option value="">{t('— заагаагүй —')}</option>
              {Object.entries(ORIGINAL_OR_COPY).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Хэл, орчуулгын шаардлага')} htmlFor="tn" error={errs.translationNote} hint={t('Эх сурвалжид заасныг л бичнэ')}>
            <input
              id="tn"
              maxLength={500}
              value={f.translationNote}
              onChange={(e) =>
                setF({
                  ...f,
                  translationNote: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Дараалал')} htmlFor="o">
            <input
              id="o"
              type="number"
              min={0}
              value={f.sortOrder}
              onChange={(e) =>
                setF({
                  ...f,
                  sortOrder: e.target.value,
                })
              }
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={f.isRequired}
              onChange={(e) =>
                setF({
                  ...f,
                  isRequired: e.target.checked,
                })
              }
            />
            <span>{t('Заавал хавсаргана (дутуу бол илгээхгүй)')}</span>
          </label>
        </div>
      </Modal>
      <Confirm
        open={!!del}
        title={t('Шаардлага устгах уу?')}
        tone="danger"
        confirmLabel={t('Устгах')}
        loading={busy}
        onClose={() => setDel(null)}
        onConfirm={remove}
      >
        <strong>{del?.title}</strong> {t('шаардлагыг энэ ноорог хувилбараас устгана.')}
      </Confirm>
    </Page>
  );
}
