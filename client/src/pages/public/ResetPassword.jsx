import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Field, Button, Alert } from '../../components/ui.jsx';
import { useUrlToken } from './VerifyEmail.jsx';

// Үе 2 — имэйлээр ирсэн нэг удаагийн холбоосоор шинэ нууц үг тохируулах. Бүх төхөөрөмжөөс гаргана.
export default function ResetPassword() {
  const token = useUrlToken();
  const navigate = useNavigate();
  const [f, setF] = useState({ newPassword: '', newPasswordConfirm: '' });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (f.newPassword.length < 8 || !/\d/.test(f.newPassword) || !/\p{L}/u.test(f.newPassword))
      fe.newPassword = 'Дор хаяж 8 тэмдэгт, үсэг ба тоо.';
    if (f.newPassword !== f.newPasswordConfirm) fe.newPasswordConfirm = 'Нууц үг таарахгүй байна.';
    setErrors(fe);
    setErr('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api.post('/api/auth/password/reset', { token, ...f });
      navigate('/login?reset=1', { replace: true });
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page crumb={[{ label: 'Нэвтрэх', to: '/login' }, { label: 'Шинэ нууц үг' }]} title="Шинэ нууц үг тохируулах">
      <Card className="auth-card">
        {!token ? (
          <Alert tone="danger">
            Холбоос буруу байна. <Link to="/forgot-password">Дахин хүсэлт илгээх</Link>
          </Alert>
        ) : (
          <form onSubmit={submit} className="stack" noValidate>
            {err && (
              <Alert tone="danger">
                {err} <Link to="/forgot-password">Шинэ холбоос авах</Link>
              </Alert>
            )}
            <Field label="Шинэ нууц үг" htmlFor="rp1" error={errors.newPassword} hint="Дор хаяж 8 тэмдэгт, үсэг ба тоо">
              <input
                id="rp1"
                type="password"
                autoComplete="new-password"
                value={f.newPassword}
                onChange={(e) => setF({ ...f, newPassword: e.target.value })}
              />
            </Field>
            <Field label="Шинэ нууц үг давтах" htmlFor="rp2" error={errors.newPasswordConfirm}>
              <input
                id="rp2"
                type="password"
                autoComplete="new-password"
                value={f.newPasswordConfirm}
                onChange={(e) => setF({ ...f, newPasswordConfirm: e.target.value })}
              />
            </Field>
            <Button type="submit" loading={busy}>
              Нууц үг шинэчлэх
            </Button>
            <p className="small muted mb0">Шинэчилсний дараа бүх төхөөрөмжөөс гарна.</p>
          </form>
        )}
      </Card>
    </Page>
  );
}
