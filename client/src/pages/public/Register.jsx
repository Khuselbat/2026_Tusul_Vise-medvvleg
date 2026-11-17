import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Field, Button, Alert } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

// Зураг 39 / UC-01 Бүртгүүлэх — APPLICANT эрхтэй; эрх сонгох талбар байхгүй
import { t } from '../../i18n.js';
export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({
    displayName: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  const set = (k) => (e) =>
    setF({
      ...f,
      [k]: e.target.value,
    });
  function validate() {
    const fe = {};
    if (f.displayName.trim().length < 2) fe.displayName = t('Нэрээ оруулна уу.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) fe.email = t('Имэйлийн хэлбэр буруу байна.');
    if (f.password.length < 8 || !/\d/.test(f.password) || !/[A-Za-zА-Яа-яӨөҮүЁё]/.test(f.password))
      fe.password = t('Дор хаяж 8 тэмдэгт, үсэг ба тоо агуулна.');
    if (f.password !== f.passwordConfirm) fe.passwordConfirm = t('Нууц үг таарахгүй байна.');
    return fe;
  }
  async function submit(e) {
    e.preventDefault();
    const fe = validate();
    setErrors(fe);
    setErr('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      await api.post('/api/auth/register', f);
      navigate('/login?registered=1');
    } catch (ex) {
      setErrors(ex.fields || {});
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      crumb={[
        {
          label: t('Бүртгүүлэх'),
        },
      ]}
      title={t('Шинэ хэрэглэгч бүртгүүлэх')}
      subtitle={t('Нэг имэйлээр нэг бүртгэл үүсгэнэ')}
    >
      <Card className="auth-card">
        {err && <Alert tone="danger">{err}</Alert>}
        <form onSubmit={submit} className="stack" noValidate>
          <Field label={t('Нэр')} htmlFor="name" error={errors.displayName} required>
            <input id="name" autoComplete="name" value={f.displayName} onChange={set('displayName')} />
          </Field>
          <Field label={t('Имэйл')} htmlFor="email" error={errors.email} required>
            <input id="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label={t('Нууц үг')} htmlFor="pw" error={errors.password} hint={t('Дор хаяж 8 тэмдэгт, үсэг ба тоо')} required>
            <input id="pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
          </Field>
          <Field label={t('Нууц үг давтах')} htmlFor="pw2" error={errors.passwordConfirm} required>
            <input id="pw2" type="password" autoComplete="new-password" value={f.passwordConfirm} onChange={set('passwordConfirm')} />
          </Field>
          <p className="small muted">{t('Бүртгүүлснээр таны анкет, хавсралт зөвхөн танд болон хуваарилагдсан операторт харагдана.')}</p>
          <div className="row-actions">
            <Button type="submit" loading={busy}>
              {t('Бүртгүүлэх')}
            </Button>
            <Link className="btn btn-ghost" to="/login">
              {t('Нэвтрэх')}
            </Link>
          </div>
        </form>
      </Card>
    </Page>
  );
}
