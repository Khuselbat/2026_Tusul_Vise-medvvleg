import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, Modal, Field, useToast, Alert } from '../../components/ui.jsx';

// Зураг 56 Визийн төрөл удирдах
export default function VisaTypes() {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/admin/visa-types'), []);
  const countries = useAsync(() => api.get('/api/admin/countries'), []);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({ countryId: '', code: '', isActive: true });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  const open = (t) => {
    setEdit(t || {});
    setF(
      t
        ? { countryId: t.country.id, code: t.code, isActive: t.isActive }
        : { countryId: countries.data?.countries[0]?.id || '', code: '', isActive: true },
    );
    setErrs({});
  };
  async function save() {
    const fe = {};
    if (!f.countryId) fe.countryId = 'Улс сонгоно уу.';
    if (!/^[A-Za-z0-9-]+$/.test(f.code)) fe.code = 'Латин үсэг, тоо, зураас.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const body = { ...f, countryId: Number(f.countryId) };
      if (edit.id) await api.put(`/api/admin/visa-types/${edit.id}`, body);
      else await api.post('/api/admin/visa-types', body);
      toast('Хадгалагдлаа.');
      setEdit(null);
      reload();
    } catch (ex) {
      setErrs({ ...ex.fields, _: Object.keys(ex.fields || {}).length ? '' : ex.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Визийн төрөл' }]}
      title="Визийн төрөл удирдах"
      subtitle="Төрөл, нийтэлсэн болон ноорог хувилбарууд"
      actions={<Button onClick={() => open(null)}>Төрөл нэмэх</Button>}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.visaTypes.length === 0 ? (
          <Empty title="Визийн төрөл алга" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Улс</th>
                  <th>Код</th>
                  <th>Сүүлийн нэр</th>
                  <th>Төлөв</th>
                  <th>Нийтэлсэн</th>
                  <th>Хувилбар</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.visaTypes.map((t) => (
                  <tr key={t.id}>
                    <td>{t.country.name}</td>
                    <td className="mono">
                      <strong>{t.code}</strong>
                    </td>
                    <td>{t.latestName || '—'}</td>
                    <td>{t.isActive ? <Badge tone="ok">Идэвхтэй</Badge> : <Badge tone="muted">Идэвхгүй</Badge>}</td>
                    <td>{t.publishedVersionNo ? `v${t.publishedVersionNo}` : <span className="muted">—</span>}</td>
                    <td>{t.versionCount}</td>
                    <td className="row-actions">
                      <Link to={`/admin/visa-types/${t.id}/versions`}>Хувилбарууд</Link>
                      <button className="btn-link" onClick={() => open(t)}>
                        Засах
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
        title={edit?.id ? 'Төрөл засах' : 'Төрөл нэмэх'}
        onClose={() => setEdit(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Цуцлах
            </Button>
            <Button loading={busy} onClick={save}>
              Хадгалах
            </Button>
          </>
        }
      >
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label="Улс" htmlFor="c" error={errs.countryId} required>
            <select id="c" value={f.countryId} onChange={(e) => setF({ ...f, countryId: e.target.value })}>
              <option value="">— сонгох —</option>
              {countries.data?.countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameMn}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Код" htmlFor="code" error={errs.code} hint="ж: C-3-9" required>
            <input id="code" style={{ textTransform: 'uppercase' }} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
            <span>Идэвхтэй — шинэ мэдүүлэг хүлээн авна. Идэвхгүй болгоход хуучин архив хэвээр үлдэнэ.</span>
          </label>
        </div>
      </Modal>
    </Page>
  );
}
