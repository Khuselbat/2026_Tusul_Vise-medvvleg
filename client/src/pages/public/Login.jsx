import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, Card, Field, Button, Alert } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

// Зураг 38 Системд нэвтрэх — эрхээр нь /app, /operator, /admin руу
import { t } from '../../i18n.js';
export default function Login() {
  const { user, login } = useAuth();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [f, setF] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  async function submit(e) {
    e.preventDefault();
    const fe = {};
    if (!f.email.trim()) fe.email = t('Имэйлээ оруулна уу.');
    if (!f.password) fe.password = t('Нууц үгээ оруулна уу.');
    setErrors(fe);
    setErr('');
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const r = await login(f.email, f.password);
      const next = sp.get('next');
      if (r.mfa) {
        // Ажилтны 2FA: эхний удаа QR-аар бүртгүүлэх, дараа нь код
        navigate(`/login/mfa?mode=${r.mfa}${next ? `&next=${encodeURIComponent(next)}` : ''}`, {
          replace: true,
        });
        return;
      }
      const u = r.user;
      const home = HOME_BY_ROLE[u.role];
      navigate(next && next.startsWith(home) ? next : home, {
        replace: true,
      });
    } catch (ex) {
      setErr(ex.message);
      setErrors(ex.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      crumb={[
        {
          label: t('Нэвтрэх'),
        },
      ]}
      title={t('Системд нэвтрэх')}
      subtitle={t('Мэдүүлэгч, оператор, админ нэг хуудсаар нэвтэрнэ')}
    >
      <Card className="auth-card">
        {sp.get('registered') && (
          <Alert tone="ok">{t('Бүртгэл амжилттай үүслээ. Имэйлээр ирсэн холбоосоор хаягаа баталгаажуулаад нэвтэрнэ үү.')}</Alert>
        )}
        {sp.get('mail') === 'failed' && (
          <Alert tone="warn">
            {t('Баталгаажуулах имэйлийг илгээж чадсангүй. Нэвтэрсний дараа дээд хэсгийн “Дахин илгээх” товчоор дахин илгээнэ үү.')}
          </Alert>
        )}
        {sp.get('reset') && <Alert tone="ok">{t('Нууц үг шинэчлэгдлээ. Шинэ нууц үгээрээ нэвтэрнэ үү.')}</Alert>}
        {sp.get('mfa') === 'expired' && <Alert tone="warn">{t('Баталгаажуулалтын хугацаа дууссан. Дахин нэвтэрнэ үү.')}</Alert>}
        {err && <Alert tone="danger">{err}</Alert>}
        <form onSubmit={submit} className="stack" noValidate>
          <Field label={t('Имэйл')} htmlFor="email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={f.email}
              onChange={(e) =>
                setF({
                  ...f,
                  email: e.target.value,
                })
              }
            />
          </Field>
          <Field label={t('Нууц үг')} htmlFor="pw" error={errors.password}>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={f.password}
              onChange={(e) =>
                setF({
                  ...f,
                  password: e.target.value,
                })
              }
            />
          </Field>
          <div className="row-actions">
            <Button type="submit" loading={busy}>
              {t('Нэвтрэх')}
            </Button>
            <Link className="btn btn-ghost" to="/register">
              {t('Бүртгүүлэх')}
            </Link>
          </div>
          <Link className="small" to="/forgot-password">
            {t('Нууц үгээ мартсан уу?')}
          </Link>
        </form>
      </Card>
    </Page>
  );
}
