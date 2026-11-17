import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  Card,
  Field,
  Button,
  useToast,
  DL,
  useAsync,
  ErrorBox,
  Skeleton,
  Badge,
  Confirm,
  fmtDateTime,
} from '../../components/ui.jsx';
import { useAuth, ROLE_LABEL } from '../../auth.jsx';
import { PrivacyCard } from '../../components/Privacy.jsx';

// Зураг 49 Миний профайл (мэдүүлэгч, оператор, админ ижил бүрэлдэхүүн)
export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [nameErr, setNameErr] = useState('');
  const [busy1, setBusy1] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [busy2, setBusy2] = useState(false);
  const area = user.role === 'APPLICANT' ? '/app' : user.role === 'OPERATOR' ? '/operator' : '/admin';

  async function saveName(e) {
    e.preventDefault();
    setNameErr('');
    if (name.trim().length < 2) {
      setNameErr('Нэрээ оруулна уу.');
      return;
    }
    setBusy1(true);
    try {
      const r = await api.put('/api/auth/me/profile', { displayName: name });
      setUser({ ...user, name: r.name });
      toast('Нэр хадгалагдлаа.');
    } catch (ex) {
      setNameErr(ex.fields?.displayName || ex.message);
    } finally {
      setBusy1(false);
    }
  }
  async function savePw(e) {
    e.preventDefault();
    const fe = {};
    if (!pw.currentPassword) fe.currentPassword = 'Одоогийн нууц үгээ оруулна уу.';
    if (pw.newPassword.length < 8 || !/\d/.test(pw.newPassword)) fe.newPassword = 'Дор хаяж 8 тэмдэгт, үсэг ба тоо.';
    if (pw.newPassword !== pw.newPasswordConfirm) fe.newPasswordConfirm = 'Нууц үг таарахгүй байна.';
    setPwErr(fe);
    if (Object.keys(fe).length) return;
    setBusy2(true);
    try {
      const r = await api.put('/api/auth/me/password', pw);
      setPw({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
      toast(r.otherSessionsRevoked ? `Нууц үг солигдлоо. Бусад ${r.otherSessionsRevoked} төхөөрөмжөөс гаргалаа.` : 'Нууц үг солигдлоо.');
    } catch (ex) {
      setPwErr(ex.fields || { currentPassword: ex.message });
    } finally {
      setBusy2(false);
    }
  }

  return (
    <Page crumb={[{ label: ROLE_LABEL[user.role], to: area }, { label: 'Профайл' }]} title="Миний профайл">
      <div className="grid grid-2">
        <Card>
          <h2>Хувийн мэдээлэл</h2>
          <DL
            items={[
              ['Имэйл', user.email],
              ['Эрх', ROLE_LABEL[user.role]],
              [
                'Имэйл баталгаажуулалт',
                user.emailVerified ? (
                  <Badge key="ev" tone="ok">
                    Баталгаажсан
                  </Badge>
                ) : (
                  <Badge key="ev" tone="warn">
                    Баталгаажаагүй
                  </Badge>
                ),
              ],
              user.role !== 'APPLICANT' && [
                'Хоёр шатлалт баталгаажуулалт',
                user.mfaEnabled ? (
                  <Badge key="mfa" tone="ok">
                    Идэвхтэй (TOTP)
                  </Badge>
                ) : (
                  <Badge key="mfa" tone="warn">
                    Тохируулаагүй
                  </Badge>
                ),
              ],
            ]}
          />
          <form className="stack mt" onSubmit={saveName} noValidate>
            <Field label="Харагдах нэр" htmlFor="dn" error={nameErr}>
              <input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div>
              <Button type="submit" loading={busy1}>
                Нэр хадгалах
              </Button>
            </div>
            {user.role === 'APPLICANT' && <p className="small muted mb0">Өмнө илгээсэн анкетын нэр өөрчлөгдөхгүй.</p>}
          </form>
        </Card>
        <Card>
          <h2>Нууц үг солих</h2>
          <form className="stack" onSubmit={savePw} noValidate>
            <Field label="Одоогийн нууц үг" htmlFor="cp" error={pwErr.currentPassword}>
              <input
                id="cp"
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="Шинэ нууц үг" htmlFor="np" error={pwErr.newPassword}>
              <input
                id="np"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              />
            </Field>
            <Field label="Шинэ нууц үг давтах" htmlFor="np2" error={pwErr.newPasswordConfirm}>
              <input
                id="np2"
                type="password"
                autoComplete="new-password"
                value={pw.newPasswordConfirm}
                onChange={(e) => setPw({ ...pw, newPasswordConfirm: e.target.value })}
              />
            </Field>
            <div>
              <Button type="submit" loading={busy2}>
                Нууц үг солих
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <Sessions />
      {user.role === 'APPLICANT' && <PrivacyCard />}
    </Page>
  );
}

/** Үе 2 — идэвхтэй сессүүд: нэг бүрчлэн хаах, бүх төхөөрөмжөөс гарах */
function Sessions() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/auth/sessions'), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function revoke(s) {
    await api.del(`/api/auth/sessions/${s.id}`);
    if (s.current) {
      setUser(null);
      navigate('/login', { replace: true });
    } else {
      toast('Сесс хаагдлаа.');
      reload();
    }
  }

  async function revokeAll() {
    setBusy(true);
    try {
      await api.post('/api/auth/sessions/revoke-all');
      setUser(null);
      navigate('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt">
      <div className="between">
        <h2>Нэвтэрсэн төхөөрөмжүүд</h2>
        <Button variant="ghost" className="btn-sm" onClick={() => setConfirm(true)}>
          Бүх төхөөрөмжөөс гарах
        </Button>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={2} />
      ) : (
        data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Төхөөрөмж</th>
                  <th>Нэвтэрсэн</th>
                  <th>Сүүлд идэвхтэй</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id}>
                    <td className="small" style={{ maxWidth: 320 }}>
                      {s.userAgent || 'Тодорхойгүй'} {s.current && <Badge tone="info">Энэ төхөөрөмж</Badge>}
                    </td>
                    <td>{fmtDateTime(s.createdAt)}</td>
                    <td>{fmtDateTime(s.lastSeenAt)}</td>
                    <td>
                      <button className="btn-link danger" onClick={() => revoke(s)}>
                        {s.current ? 'Гарах' : 'Хаах'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="small muted mb0">Нууц үг солиход бусад төхөөрөмжөөс автоматаар гарна.</p>
      <Confirm
        open={confirm}
        title="Бүх төхөөрөмжөөс гарах уу?"
        tone="danger"
        confirmLabel="Бүгдээс гарах"
        loading={busy}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={revokeAll}
      >
        Энэ төхөөрөмж орно. Дахин нэвтрэх шаардлагатай болно.
      </Confirm>
    </Card>
  );
}
