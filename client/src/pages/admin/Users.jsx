import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
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
  fmtDate,
} from '../../components/ui.jsx';
import { ROLE_LABEL } from '../../auth.jsx';

// Зураг 59 Хэрэглэгч ба эрхийн удирдлага — паспорт, анкет, файл нээхгүй
export default function Users() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const role = sp.get('role') || '';
  const q = sp.get('q') || '';
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/users${qs({ role, q })}`), [role, q]);
  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'OPERATOR' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState(null);
  const [toggleErr, setToggleErr] = useState('');

  async function create() {
    const fe = {};
    if (f.name.trim().length < 2) fe.name = 'Нэр оруулна уу.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) fe.email = 'Имэйл буруу.';
    if (f.password.length < 8 || !/\d/.test(f.password)) fe.password = 'Дор хаяж 8 тэмдэгт, үсэг ба тоо.';
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api.post('/api/admin/users', f);
      toast('Ажилтан бүртгэгдлээ.');
      setCreateOpen(false);
      setF({ name: '', email: '', password: '', role: 'OPERATOR' });
      reload();
    } catch (ex) {
      setErrs({ ...ex.fields, _: Object.keys(ex.fields || {}).length ? '' : ex.message });
    } finally {
      setBusy(false);
    }
  }
  async function doToggle() {
    setBusy(true);
    setToggleErr('');
    try {
      await api.put(`/api/admin/users/${toggle.id}/status`, { isActive: !toggle.isActive });
      toast('Төлөв солигдлоо.');
      setToggle(null);
      reload();
    } catch (ex) {
      setToggleErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  const setP = (k) => (e) => {
    const n = new URLSearchParams(sp);
    if (e.target.value) n.set(k, e.target.value);
    else n.delete(k);
    setSp(n);
  };

  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Хэрэглэгчид' }]}
      title="Хэрэглэгч ба эрхийн удирдлага"
      subtitle="Ажилтан бүртгэх, нэвтрэх эрхийг идэвхжүүлэх/хаах"
      actions={
        <Button
          onClick={() => {
            setCreateOpen(true);
            setErrs({});
          }}
        >
          Ажилтан бүртгэх
        </Button>
      }
    >
      <div className="filters">
        <Field label="Эрх" htmlFor="r">
          <select id="r" value={role} onChange={setP('role')}>
            <option value="">Бүгд</option>
            <option value="APPLICANT">Мэдүүлэгч</option>
            <option value="OPERATOR">Оператор</option>
            <option value="ADMIN">Админ</option>
          </select>
        </Field>
        <Field label="Хайх" htmlFor="q" className="grow">
          <input id="q" value={q} placeholder="Нэр эсвэл имэйл" onChange={setP('q')} />
        </Field>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.users.length === 0 ? (
          <Empty title="Хэрэглэгч олдсонгүй" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Нэр</th>
                  <th>Имэйл</th>
                  <th>Эрх</th>
                  <th>Төлөв</th>
                  <th>Нээлттэй хуваарилалт</th>
                  <th>Бүртгэсэн</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.isActive ? <Badge tone="ok">Идэвхтэй</Badge> : <Badge tone="danger">Хаалттай</Badge>}</td>
                    <td>{u.role === 'OPERATOR' ? u.openAssignments : '—'}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td>
                      <button
                        className={`btn-link ${u.isActive ? 'danger' : ''}`}
                        onClick={() => {
                          setToggle(u);
                          setToggleErr('');
                        }}
                      >
                        {u.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
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
        open={createOpen}
        title="Ажилтан бүртгэх"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Цуцлах
            </Button>
            <Button loading={busy} onClick={create}>
              Бүртгэх
            </Button>
          </>
        }
      >
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label="Нэр" htmlFor="n" error={errs.name} required>
            <input id="n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Имэйл" htmlFor="e" error={errs.email} required>
            <input id="e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Анхны нууц үг" htmlFor="p" error={errs.password} hint="Ажилтан нэвтэрсний дараа профайлаас солино" required>
            <input id="p" type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label="Эрх" htmlFor="ro">
            <select id="ro" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="OPERATOR">Оператор</option>
              <option value="ADMIN">Админ</option>
            </select>
          </Field>
        </div>
      </Modal>
      <Confirm
        open={!!toggle}
        title={toggle?.isActive ? 'Идэвхгүй болгох уу?' : 'Идэвхжүүлэх үү?'}
        tone={toggle?.isActive ? 'danger' : 'primary'}
        loading={busy}
        onClose={() => setToggle(null)}
        onConfirm={doToggle}
      >
        {toggleErr ? (
          <Alert tone="danger">{toggleErr}</Alert>
        ) : (
          <p>
            <strong>{toggle?.name}</strong> ({toggle?.email}){' '}
            {toggle?.isActive ? 'системд нэвтрэх эрхээ даруй алдана.' : 'дахин нэвтрэх боломжтой болно.'}
          </p>
        )}
      </Confirm>
    </Page>
  );
}
