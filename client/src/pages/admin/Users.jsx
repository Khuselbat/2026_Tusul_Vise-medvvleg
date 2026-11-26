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
  TableWrap,
} from '../../components/ui.jsx';
import { ROLE_LABEL, useAuth } from '../../auth.jsx';

// Зураг 59 Хэрэглэгч ба эрхийн удирдлага — паспорт, анкет, файл нээхгүй
import { t } from '../../i18n.js';
export default function Users() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const role = sp.get('role') || '';
  const q = sp.get('q') || '';
  const { data, error, loading, reload } = useAsync(
    () =>
      api.get(
        `/api/admin/users${qs({
          role,
          q,
        })}`,
      ),
    [role, q],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [f, setF] = useState({
    name: '',
    email: '',
    password: '',
    role: 'OPERATOR',
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState(null);
  const [toggleErr, setToggleErr] = useState('');
  const [mfaReset, setMfaReset] = useState(null);
  const [mfaErr, setMfaErr] = useState('');
  const { user: me } = useAuth();
  async function doMfaReset() {
    setBusy(true);
    setMfaErr('');
    try {
      await api.post(`/api/admin/users/${mfaReset.id}/mfa-reset`);
      toast(t('2FA дахин тохируулагдлаа. Ажилтан дараагийн нэвтрэлтэд QR-аар бүртгүүлнэ.'));
      setMfaReset(null);
      reload();
    } catch (ex) {
      setMfaErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    const fe = {};
    if (f.name.trim().length < 2) fe.name = t('Нэр оруулна уу.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) fe.email = t('Имэйл буруу.');
    if (f.password.length < 8 || !/\d/.test(f.password)) fe.password = t('Дор хаяж 8 тэмдэгт, үсэг ба тоо.');
    setErrs(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api.post('/api/admin/users', f);
      toast(t('Ажилтан бүртгэгдлээ.'));
      setCreateOpen(false);
      setF({
        name: '',
        email: '',
        password: '',
        role: 'OPERATOR',
      });
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
  async function doToggle() {
    setBusy(true);
    setToggleErr('');
    try {
      await api.put(`/api/admin/users/${toggle.id}/status`, {
        isActive: !toggle.isActive,
      });
      toast(t('Төлөв солигдлоо.'));
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
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Хэрэглэгчид'),
        },
      ]}
      title={t('Хэрэглэгч ба эрхийн удирдлага')}
      subtitle={t('Ажилтан бүртгэх, нэвтрэх эрхийг идэвхжүүлэх/хаах')}
      actions={
        <Button
          onClick={() => {
            setCreateOpen(true);
            setErrs({});
          }}
        >
          {t('Ажилтан бүртгэх')}
        </Button>
      }
    >
      <div className="filters">
        <Field label={t('Эрх')} htmlFor="r">
          <select id="r" value={role} onChange={setP('role')}>
            <option value="">{t('Бүгд')}</option>
            <option value="APPLICANT">{t('Мэдүүлэгч')}</option>
            <option value="OPERATOR">{t('Оператор')}</option>
            <option value="ADMIN">{t('Админ')}</option>
          </select>
        </Field>
        <Field label={t('Хайх')} htmlFor="q" className="grow">
          <input id="q" value={q} placeholder={t('Нэр эсвэл имэйл')} onChange={setP('q')} />
        </Field>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.users.length === 0 ? (
          <Empty title={t('Хэрэглэгч олдсонгүй')} />
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('Нэр')}</th>
                  <th>{t('Имэйл')}</th>
                  <th>{t('Эрх')}</th>
                  <th>{t('Төлөв')}</th>
                  <th>2FA</th>
                  <th>{t('Нээлттэй хуваарилалт')}</th>
                  <th>{t('Бүртгэсэн')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.isActive ? <Badge tone="ok">{t('Идэвхтэй')}</Badge> : <Badge tone="danger">{t('Хаалттай')}</Badge>}</td>
                    <td>
                      {u.role === 'APPLICANT' ? (
                        '—'
                      ) : u.mfaEnabled ? (
                        <Badge tone="ok">{t('Идэвхтэй')}</Badge>
                      ) : (
                        <Badge tone="warn">{t('Тохируулаагүй')}</Badge>
                      )}
                    </td>
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
                        {u.isActive ? t('Идэвхгүй болгох') : t('Идэвхжүүлэх')}
                      </button>
                      {u.role !== 'APPLICANT' && u.mfaEnabled && u.email !== me?.email && (
                        <button
                          className="btn-link"
                          style={{
                            marginLeft: 12,
                          }}
                          onClick={() => {
                            setMfaReset(u);
                            setMfaErr('');
                          }}
                        >
                          {t('2FA дахин тохируулах')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
      <Modal
        open={createOpen}
        title={t('Ажилтан бүртгэх')}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('Цуцлах')}
            </Button>
            <Button loading={busy} onClick={create}>
              {t('Бүртгэх')}
            </Button>
          </>
        }
      >
        <div className="stack">
          {errs._ && <Alert tone="danger">{errs._}</Alert>}
          <Field label={t('Нэр')} htmlFor="n" error={errs.name} required>
            <input
              id="n"
              value={f.name}
              onChange={(e) =>
                setF({
                  ...f,
                  name: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Имэйл')} htmlFor="e" error={errs.email} required>
            <input
              id="e"
              type="email"
              value={f.email}
              onChange={(e) =>
                setF({
                  ...f,
                  email: e.target.value,
                })
              }
            />
          </Field>
          <Field
            label={t('Анхны нууц үг')}
            htmlFor="p"
            error={errs.password}
            hint={t('Ажилтан нэвтэрсний дараа профайлаас солино')}
            required
          >
            <input
              id="p"
              type="text"
              autoComplete="off"
              value={f.password}
              onChange={(e) =>
                setF({
                  ...f,
                  password: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Эрх')} htmlFor="ro">
            <select
              id="ro"
              value={f.role}
              onChange={(e) =>
                setF({
                  ...f,
                  role: e.target.value,
                })
              }
            >
              <option value="OPERATOR">{t('Оператор')}</option>
              <option value="ADMIN">{t('Админ')}</option>
            </select>
          </Field>
        </div>
      </Modal>
      <Confirm
        open={!!toggle}
        title={toggle?.isActive ? t('Идэвхгүй болгох уу?') : t('Идэвхжүүлэх үү?')}
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
            {toggle?.isActive ? t('системд нэвтрэх эрхээ даруй алдана.') : t('дахин нэвтрэх боломжтой болно.')}
          </p>
        )}
      </Confirm>
      <Confirm
        open={!!mfaReset}
        title={t('2FA-г дахин тохируулах уу?')}
        tone="danger"
        loading={busy}
        onClose={() => setMfaReset(null)}
        onConfirm={doMfaReset}
      >
        {mfaErr ? (
          <Alert tone="danger">{mfaErr}</Alert>
        ) : (
          <p>
            <strong>{mfaReset?.name}</strong>
            {t(
              '-ийн 2FA болон нөөц кодууд устаж, бүх төхөөрөмжөөс гарна. Дараагийн нэвтрэлтэд QR-аар дахин бүртгүүлнэ. Ажилтны биеийг баталгаажуулсны дараа л хийнэ үү.',
            )}
          </p>
        )}
      </Confirm>
    </Page>
  );
}
