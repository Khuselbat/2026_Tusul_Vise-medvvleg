import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, Modal, Field, useToast, Alert } from '../../components/ui.jsx';

// Зураг 56 Визийн төрөл удирдах
import { t } from '../../i18n.js';
export default function VisaTypes() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/admin/visa-types'), []);
  const countries = useAsync(() => api.get('/api/admin/countries'), []);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({
    countryId: '',
    code: '',
    isActive: true,
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const open = (tv) => {
    setEdit(tv || {});
    setF(
      tv
        ? {
            countryId: tv.country.id,
            code: tv.code,
            isActive: tv.isActive,
          }
        : {
            countryId: countries.data?.countries[0]?.id || '',
            code: '',
            isActive: true,
          },
    );
    setErrs({});
  };
  async function save() {
    const fe = {};
    if (!f.countryId) fe.countryId = t('Улс сонгоно уу.');
    if (!/^[A-Za-z0-9-]+$/.test(f.code)) fe.code = t('Латин үсэг, тоо, зураас.');
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const body = {
        ...f,
        countryId: Number(f.countryId),
      };
      if (edit.id) await api.put(`/api/admin/visa-types/${edit.id}`, body);
      else await api.post('/api/admin/visa-types', body);
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
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Визийн төрөл'),
        },
      ]}
      title={t('Визийн төрөл удирдах')}
      subtitle={t('Төрөл, нийтэлсэн болон ноорог хувилбарууд')}
      actions={<Button onClick={() => open(null)}>{t('Төрөл нэмэх')}</Button>}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.visaTypes.length === 0 ? (
          <Empty title={t('Визийн төрөл алга')} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Улс')}</th>
                  <th>{t('Код')}</th>
                  <th>{t('Сүүлийн нэр')}</th>
                  <th>{t('Төлөв')}</th>
                  <th>{t('Нийтэлсэн')}</th>
                  <th>{t('Хувилбар')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.visaTypes.map((tv2) => (
                  <tr key={tv2.id}>
                    <td>{tv2.country.name}</td>
                    <td className="mono">
                      <strong>{tv2.code}</strong>
                    </td>
                    <td>{tv2.latestName || '—'}</td>
                    <td>{tv2.isActive ? <Badge tone="ok">{t('Идэвхтэй')}</Badge> : <Badge tone="muted">{t('Идэвхгүй')}</Badge>}</td>
                    <td>{tv2.publishedVersionNo ? `v${tv2.publishedVersionNo}` : <span className="muted">—</span>}</td>
                    <td>{tv2.versionCount}</td>
                    <td className="row-actions">
                      <Link to={`/admin/visa-types/${tv2.id}/versions`}>{t('Хувилбарууд')}</Link>
                      <button className="btn-link" onClick={() => open(tv2)}>
                        {t('Засах')}
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
        title={edit?.id ? t('Төрөл засах') : t('Төрөл нэмэх')}
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
          <Field label={t('Улс')} htmlFor="c" error={errs.countryId} required>
            <select
              id="c"
              value={f.countryId}
              onChange={(e) =>
                setF({
                  ...f,
                  countryId: e.target.value,
                })
              }
            >
              <option value="">{t('— сонгох —')}</option>
              {countries.data?.countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameMn}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Код')} htmlFor="code" error={errs.code} hint={t('ж: C-3-9')} required>
            <input
              id="code"
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
          <label className="check">
            <input
              type="checkbox"
              checked={f.isActive}
              onChange={(e) =>
                setF({
                  ...f,
                  isActive: e.target.checked,
                })
              }
            />
            <span>{t('Идэвхтэй — шинэ мэдүүлэг хүлээн авна. Идэвхгүй болгоход хуучин архив хэвээр үлдэнэ.')}</span>
          </label>
        </div>
      </Modal>
    </Page>
  );
}
