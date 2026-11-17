import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Field, Button, Alert } from '../../components/ui.jsx';

// Үе 2 — нууц үг сэргээх хүсэлт. Хариу нь бүртгэл байгаа эсэхээс үл хамааран ижил.
import { t, translateServer } from '../../i18n.js';
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr(t('Имэйлийн хэлбэр буруу байна.'));
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/api/auth/password/forgot', {
        email,
      });
      setMsg(translateServer(r.message));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      crumb={[
        {
          label: t('Нэвтрэх'),
          to: '/login',
        },
        {
          label: t('Нууц үг сэргээх'),
        },
      ]}
      title={t('Нууц үг сэргээх')}
    >
      <Card className="auth-card">
        {msg ? (
          <>
            <Alert tone="ok">{msg}</Alert>
            <p className="small muted">{t('Холбоос 30 минутын дотор, нэг удаа хүчинтэй. Spam хавтсаа ч шалгана уу.')}</p>
            <Link to="/login">{t('Нэвтрэх хуудас руу')}</Link>
          </>
        ) : (
          <form onSubmit={submit} className="stack" noValidate>
            <p
              className="small muted"
              style={{
                marginTop: 0,
              }}
            >
              {t('Бүртгэлтэй имэйлээ оруулна уу. Нууц үг шинэчлэх холбоос илгээнэ.')}
            </p>
            <Field label={t('Имэйл')} htmlFor="fp-email" error={err}>
              <input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <div className="row-actions">
              <Button type="submit" loading={busy}>
                {t('Холбоос илгээх')}
              </Button>
              <Link className="btn btn-ghost" to="/login">
                {t('Буцах')}
              </Link>
            </div>
          </form>
        )}
      </Card>
    </Page>
  );
}
