import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, Modal, Field, Confirm, useToast, Alert, LinkButton } from '../../components/ui.jsx';

const EMPTY = { code: '', title: '', instructions: '', isRequired: true, sortOrder: 10 };

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
  const v = data?.version;
  const ro = !!v?.publishedAt;

  const open = (r) => {
    const maxSort = Math.max(0, ...(data?.requirements || []).map((x) => x.sortOrder));
    setEdit(r || {});
    setF(r ? { code: r.code, title: r.title, instructions: r.instructions || '', isRequired: r.isRequired, sortOrder: r.sortOrder } : { ...EMPTY, sortOrder: maxSort + 10 });
    setErrs({});
  };
  async function save() {
    const fe = {};
    if (!/^[A-Za-z0-9_-]+$/.test(f.code)) fe.code = 'Латин үсэг, тоо, _ -';
    if (f.title.trim().length < 2) fe.title = 'Нэр оруулна уу.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const body = { ...f, sortOrder: Number(f.sortOrder) || 0 };
      if (edit.id) await api.put(`/api/admin/requirements/${edit.id}`, body); else await api.post(`/api/admin/versions/${id}/requirements`, body);
      toast('Хадгалагдлаа.'); setEdit(null); reload();
    } catch (ex) { setErrs({ ...ex.fields, _: Object.keys(ex.fields || {}).length ? '' : ex.message }); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/api/admin/requirements/${del.id}`); toast('Устгалаа.', 'info'); setDel(null); reload(); } catch (ex) { toast(ex.message, 'danger'); setDel(null); } finally { setBusy(false); }
  }

  return (
    <Page crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Визийн төрөл', to: '/admin/visa-types' }, { label: v ? `${v.typeCode} v${v.versionNo}` : '…', to: `/admin/versions/${id}` }, { label: 'Шаардлага' }]}
      title="Бүрдүүлэх материалын шаардлага" subtitle={v && `${v.countryName} · ${v.typeCode} · v${v.versionNo} — ${v.nameMn}`}
      actions={<>{!ro && <Button onClick={() => open(null)}>Шаардлага нэмэх</Button>}<LinkButton variant="ghost" to={`/admin/versions/${id}`}>Хувилбар руу</LinkButton></>}>
      {ro && <Alert tone="info">Нийтэлсэн хувилбарын шаардлагыг засахгүй (зөвхөн уншина). <Link to={`/admin/versions/${id}`}>Хуулж шинэ хувилбар үүсгэх</Link></Alert>}
      <Alert tone="warn">Жишээ шаардлагыг бодит хууль зүйн шаардлага гэж үзэхгүй — эх сурвалжтай тулгаж оруулна.</Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? <Skeleton /> : data && (data.requirements.length === 0 ? <Empty title="Шаардлага нэмээгүй" action={!ro && <Button onClick={() => open(null)}>Шаардлага нэмэх</Button>}>Нийтлэхэд дор хаяж нэг шаардлага хэрэгтэй.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Дараалал</th><th>Код</th><th>Нэр</th><th>Заавар</th><th>Заавал</th>{!ro && <th />}</tr></thead>
            <tbody>
              {data.requirements.map((r) => (
                <tr key={r.id}>
                  <td>{r.sortOrder}</td><td className="mono">{r.code}</td><td><strong>{r.title}</strong></td>
                  <td className="small muted" style={{ maxWidth: 380 }}>{r.instructions}</td>
                  <td>{r.isRequired ? <Badge tone="info">Заавал</Badge> : <Badge tone="muted">Хамаарах бол</Badge>}</td>
                  {!ro && <td className="row-actions"><button className="btn-link" onClick={() => open(r)}>Засах</button><button className="btn-link danger" onClick={() => setDel(r)}>Устгах</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <Modal open={!!edit} title={edit?.id ? 'Шаардлага засах' : 'Шаардлага нэмэх'} onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Цуцлах</Button><Button loading={busy} onClick={save}>Хадгалах</Button></>}>
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label="Код" htmlFor="c" error={errs.code} hint="Нэг хувилбарт давтагдахгүй, ж: PASSPORT_COPY" required><input id="c" style={{ textTransform: 'uppercase' }} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Нэр" htmlFor="t" error={errs.title} required><input id="t" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Заавар" htmlFor="i"><textarea id="i" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
          <Field label="Дараалал" htmlFor="o"><input id="o" type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={f.isRequired} onChange={(e) => setF({ ...f, isRequired: e.target.checked })} /><span>Заавал хавсаргана (дутуу бол илгээхгүй)</span></label>
        </div>
      </Modal>
      <Confirm open={!!del} title="Шаардлага устгах уу?" tone="danger" confirmLabel="Устгах" loading={busy} onClose={() => setDel(null)} onConfirm={remove}>
        <strong>{del?.title}</strong> шаардлагыг энэ ноорог хувилбараас устгана.
      </Confirm>
    </Page>
  );
}
