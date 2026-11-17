import { useState } from 'react';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, Modal, Field, Confirm, useToast, Alert } from '../../components/ui.jsx';
import { t } from '../../i18n.js';
const EMPTY = {
  isoCode: '',
  nameMn: '',
  serviceStatus: 'COMING_SOON',
  officialResultUrl: '',
};

// Зураг 55 Улсын мэдээлэл удирдах
export default function Countries() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/admin/countries'), []);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [delErr, setDelErr] = useState('');
  const open = (c) => {
    setEdit(c || {});
    setF(
      c
        ? {
            isoCode: c.isoCode,
            nameMn: c.nameMn,
            serviceStatus: c.serviceStatus,
            officialResultUrl: c.officialResultUrl || '',
          }
        : EMPTY,
    );
    setErrs({});
  };
  async function save() {
    const fe = {};
    if (!/^[A-Za-z]{2}$/.test(f.isoCode)) fe.isoCode = t('ISO код 2 үсэг.');
    if (f.nameMn.trim().length < 2) fe.nameMn = t('Нэр оруулна уу.');
    if (f.officialResultUrl && !f.officialResultUrl.startsWith('https://')) fe.officialResultUrl = t('Зөвхөн HTTPS холбоос.');
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      if (edit.id) await api.put(`/api/admin/countries/${edit.id}`, f);
      else await api.post('/api/admin/countries', f);
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
    setDelErr('');
    try {
      await api.del(`/api/admin/countries/${del.id}`);
      toast(t('Устгалаа.'), 'info');
      setDel(null);
      reload();
    } catch (ex) {
      setDelErr(ex.message);
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
          label: t('Улс'),
        },
      ]}
      title={t('Улсын мэдээлэл удирдах')}
      subtitle={t('Үйлчилгээний төлөв ба албан ёсны хариу шалгах холбоос')}
      actions={<Button onClick={() => open(null)}>{t('Улс нэмэх')}</Button>}
    >
      <Alert tone="info">
        {t(
          'Эхний хувилбарт зөвхөн БНСУ-ын мэдүүлэг идэвхтэй (BR-03). Бусад улсыг нэр нь баталгаажсаны дараа “Тун удахгүй” төлөвтэй нэмнэ.',
        )}
      </Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.countries.length === 0 ? (
          <Empty title={t('Улс бүртгээгүй')} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ISO</th>
                  <th>{t('Нэр')}</th>
                  <th>{t('Төлөв')}</th>
                  <th>{t('Албан хариу шалгах URL')}</th>
                  <th>{t('Төрөл')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.countries.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.isoCode}</td>
                    <td>{c.nameMn}</td>
                    <td>
                      <Badge status={c.serviceStatus} />
                    </td>
                    <td
                      className="small"
                      style={{
                        maxWidth: 320,
                        wordBreak: 'break-all',
                      }}
                    >
                      {c.officialResultUrl || <span className="muted">—</span>}
                    </td>
                    <td>{c.typeCount}</td>
                    <td className="row-actions">
                      <button className="btn-link" onClick={() => open(c)}>
                        {t('Засах')}
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={() => {
                          setDel(c);
                          setDelErr('');
                        }}
                      >
                        {t('Устгах')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      <Modal
        open={!!edit}
        title={edit?.id ? t('Улс засах') : t('Улс нэмэх')}
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
          <Field label={t('ISO код')} htmlFor="iso" error={errs.isoCode} required>
            <input
              id="iso"
              maxLength={2}
              style={{
                textTransform: 'uppercase',
              }}
              value={f.isoCode}
              onChange={(e) =>
                setF({
                  ...f,
                  isoCode: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Монгол нэр')} htmlFor="nm" error={errs.nameMn} required>
            <input
              id="nm"
              value={f.nameMn}
              onChange={(e) =>
                setF({
                  ...f,
                  nameMn: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Үйлчилгээний төлөв')} htmlFor="st">
            <select
              id="st"
              value={f.serviceStatus}
              onChange={(e) =>
                setF({
                  ...f,
                  serviceStatus: e.target.value,
                })
              }
            >
              <option value="ACTIVE">{t('Идэвхтэй')}</option>
              <option value="COMING_SOON">{t('Тун удахгүй')}</option>
              <option value="DISABLED">{t('Хаалттай')}</option>
            </select>
          </Field>
          <Field
            label={t('Албан ёсны хариу шалгах URL')}
            htmlFor="url"
            error={errs.officialResultUrl}
            hint={t('Баталгаажсан HTTPS холбоос')}
          >
            <input
              id="url"
              value={f.officialResultUrl}
              onChange={(e) =>
                setF({
                  ...f,
                  officialResultUrl: e.target.value,
                })
              }
              placeholder="https://"
            />
          </Field>
        </div>
      </Modal>
      <Confirm
        open={!!del}
        title={t('Улс устгах уу?')}
        tone="danger"
        confirmLabel={t('Устгах')}
        loading={busy}
        onClose={() => setDel(null)}
        onConfirm={remove}
      >
        {delErr ? (
          <Alert tone="danger">{delErr}</Alert>
        ) : (
          <p>
            <strong>{del?.nameMn}</strong> {t('улсыг устгана. Холбоотой визийн төрөлтэй бол устгахгүй.')}
          </p>
        )}
      </Confirm>
    </Page>
  );
}
