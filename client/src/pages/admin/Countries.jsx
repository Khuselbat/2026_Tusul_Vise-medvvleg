import { useState } from 'react';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, Modal, Field, Confirm, useToast, Alert } from '../../components/ui.jsx';

const EMPTY = { isoCode: '', nameMn: '', serviceStatus: 'COMING_SOON', officialResultUrl: '' };

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

  const open = (c) => { setEdit(c || {}); setF(c ? { isoCode: c.isoCode, nameMn: c.nameMn, serviceStatus: c.serviceStatus, officialResultUrl: c.officialResultUrl || '' } : EMPTY); setErrs({}); };
  async function save() {
    const fe = {};
    if (!/^[A-Za-z]{2}$/.test(f.isoCode)) fe.isoCode = 'ISO код 2 үсэг.';
    if (f.nameMn.trim().length < 2) fe.nameMn = 'Нэр оруулна уу.';
    if (f.officialResultUrl && !f.officialResultUrl.startsWith('https://')) fe.officialResultUrl = 'Зөвхөн HTTPS холбоос.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      if (edit.id) await api.put(`/api/admin/countries/${edit.id}`, f); else await api.post('/api/admin/countries', f);
      toast('Хадгалагдлаа.'); setEdit(null); reload();
    } catch (ex) { setErrs({ ...ex.fields, _: Object.keys(ex.fields || {}).length ? '' : ex.message }); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setDelErr('');
    try { await api.del(`/api/admin/countries/${del.id}`); toast('Устгалаа.', 'info'); setDel(null); reload(); } catch (ex) { setDelErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <Page crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Улс' }]} title="Улсын мэдээлэл удирдах" subtitle="Үйлчилгээний төлөв ба албан ёсны хариу шалгах холбоос"
      actions={<Button onClick={() => open(null)}>Улс нэмэх</Button>}>
      <Alert tone="info">Эхний хувилбарт зөвхөн БНСУ-ын мэдүүлэг идэвхтэй (BR-03). Бусад улсыг нэр нь баталгаажсаны дараа “Тун удахгүй” төлөвтэй нэмнэ.</Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? <Skeleton /> : data && (data.countries.length === 0 ? <Empty title="Улс бүртгээгүй" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ISO</th><th>Нэр</th><th>Төлөв</th><th>Албан хариу шалгах URL</th><th>Төрөл</th><th /></tr></thead>
            <tbody>
              {data.countries.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.isoCode}</td><td>{c.nameMn}</td><td><Badge status={c.serviceStatus} /></td>
                  <td className="small" style={{ maxWidth: 320, wordBreak: 'break-all' }}>{c.officialResultUrl || <span className="muted">—</span>}</td>
                  <td>{c.typeCount}</td>
                  <td className="row-actions"><button className="btn-link" onClick={() => open(c)}>Засах</button>
                    <button className="btn-link danger" onClick={() => { setDel(c); setDelErr(''); }}>Устгах</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <Modal open={!!edit} title={edit?.id ? 'Улс засах' : 'Улс нэмэх'} onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Цуцлах</Button><Button loading={busy} onClick={save}>Хадгалах</Button></>}>
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label="ISO код" htmlFor="iso" error={errs.isoCode} required><input id="iso" maxLength={2} style={{ textTransform: 'uppercase' }} value={f.isoCode} onChange={(e) => setF({ ...f, isoCode: e.target.value })} /></Field>
          <Field label="Монгол нэр" htmlFor="nm" error={errs.nameMn} required><input id="nm" value={f.nameMn} onChange={(e) => setF({ ...f, nameMn: e.target.value })} /></Field>
          <Field label="Үйлчилгээний төлөв" htmlFor="st">
            <select id="st" value={f.serviceStatus} onChange={(e) => setF({ ...f, serviceStatus: e.target.value })}>
              <option value="ACTIVE">Идэвхтэй</option><option value="COMING_SOON">Тун удахгүй</option><option value="DISABLED">Хаалттай</option>
            </select>
          </Field>
          <Field label="Албан ёсны хариу шалгах URL" htmlFor="url" error={errs.officialResultUrl} hint="Баталгаажсан HTTPS холбоос"><input id="url" value={f.officialResultUrl} onChange={(e) => setF({ ...f, officialResultUrl: e.target.value })} placeholder="https://" /></Field>
        </div>
      </Modal>
      <Confirm open={!!del} title="Улс устгах уу?" tone="danger" confirmLabel="Устгах" loading={busy} onClose={() => setDel(null)} onConfirm={remove}>
        {delErr ? <Alert tone="danger">{delErr}</Alert> : <p><strong>{del?.nameMn}</strong> улсыг устгана. Холбоотой визийн төрөлтэй бол устгахгүй.</p>}
      </Confirm>
    </Page>
  );
}
