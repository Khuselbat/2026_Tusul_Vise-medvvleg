import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Field, Button, Alert, Skeleton } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

// Үе 2 — ажилтны хоёр шатлалт баталгаажуулалт (TOTP). mode=ENROLL: QR уншуулж бүртгүүлэх; VERIFY: код оруулах.
export default function Mfa() {
  const [sp] = useSearchParams();
  const mode = sp.get('mode') === 'ENROLL' ? 'ENROLL' : 'VERIFY';
  const navigate = useNavigate();
  const { user, completeLogin } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { user, recoveryCodes }

  const expired = (ex) => ex?.code === 'MFA_EXPIRED' && navigate('/login?mfa=expired', { replace: true });

  const started = useRef(false); // StrictMode: нууцыг давхар үүсгэхгүй
  useEffect(() => {
    if (mode !== 'ENROLL' || started.current) return;
    started.current = true;
    api
      .post('/api/auth/mfa/setup')
      .then(setSetup)
      .catch((ex) => expired(ex) || setErr(ex));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (u) => {
    const next = sp.get('next');
    const home = HOME_BY_ROLE[u.role];
    completeLogin(u);
    navigate(next && next.startsWith(home) ? next : home, { replace: true });
  };

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!code.trim()) {
      setErr({ message: useRecovery ? 'Нөөц кодоо оруулна уу.' : '6 оронтой кодоо оруулна уу.' });
      return;
    }
    setBusy(true);
    try {
      if (mode === 'ENROLL') {
        const r = await api.post('/api/auth/mfa/enable', { code });
        setDone(r); // нөөц кодыг нэг удаа харуулна
      } else {
        const r = await api.post('/api/auth/mfa/verify', useRecovery ? { recoveryCode: code } : { code });
        finish(r.user);
      }
    } catch (ex) {
      if (!expired(ex)) setErr(ex);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (user && !done) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  if (done) {
    return (
      <Page crumb={[{ label: 'Нэвтрэх' }]} title="Нөөц кодоо хадгална уу">
        <Card className="auth-card">
          <Alert tone="warn" title="Эдгээр кодыг зөвхөн одоо харуулна">
            Утсаа гээвэл нэвтрэхэд хэрэглэнэ. Код бүр нэг удаа ажиллана. Аюулгүй газар (цаасан дээр, нууц үгийн менежерт) хадгална уу.
          </Alert>
          <ul className="recovery-codes mono">
            {done.recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button onClick={() => finish(done.user)}>Хадгалсан, үргэлжлүүлэх</Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      crumb={[{ label: 'Нэвтрэх' }]}
      title={mode === 'ENROLL' ? 'Хоёр шатлалт баталгаажуулалт тохируулах' : 'Баталгаажуулах код'}
      subtitle="Оператор, админ эрхэд заавал"
    >
      <Card className="auth-card">
        {mode === 'ENROLL' &&
          (setup ? (
            <>
              <ol className="small" style={{ paddingLeft: 18 }}>
                <li>Утсандаа Google Authenticator, Microsoft Authenticator зэрэг апп суулгана.</li>
                <li>Доорх QR кодыг уншуулна (эсвэл нууц түлхүүрийг гараар оруулна).</li>
                <li>Апп-д гарсан 6 оронтой кодыг оруулна.</li>
              </ol>
              <div style={{ textAlign: 'center' }}>
                <img src={setup.qr} alt="2FA QR код" width={220} height={220} />
              </div>
              <p className="small muted" style={{ wordBreak: 'break-all' }}>
                Нууц түлхүүр:{' '}
                <span className="mono" data-testid="mfa-secret">
                  {setup.secret}
                </span>
              </p>
            </>
          ) : (
            !err && <Skeleton rows={3} />
          ))}
        {err && <Alert tone="danger">{err.message}</Alert>}
        <form onSubmit={submit} className="stack" noValidate>
          <Field
            label={useRecovery ? 'Нөөц код' : '6 оронтой код'}
            htmlFor="mfa-code"
            hint={useRecovery ? 'ж: ABCD-EFGH' : 'Апп-д харагдаж буй код'}
          >
            <input
              id="mfa-code"
              autoComplete="one-time-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              maxLength={useRecovery ? 20 : 6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="row-actions">
            <Button type="submit" loading={busy}>
              Баталгаажуулах
            </Button>
            {mode === 'VERIFY' && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setUseRecovery((x) => !x);
                  setCode('');
                  setErr(null);
                }}
              >
                {useRecovery ? 'Апп-ийн код ашиглах' : 'Нөөц код ашиглах'}
              </Button>
            )}
          </div>
        </form>
        {mode === 'VERIFY' && <p className="small muted mt mb0">Утсаа гээж, нөөц кодгүй бол админд хандаж 2FA-г дахин тохируулуулна уу.</p>}
      </Card>
    </Page>
  );
}
