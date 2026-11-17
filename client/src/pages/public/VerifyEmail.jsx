import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Alert, Loading } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

/**
 * URL-аас нэг удаагийн токеныг уншиж, хаягийн мөрөөс арилгана
 * (хөтчийн түүх, дэлгэцийн зураг, Referer-д үлдэхгүй).
 */
export function useUrlToken() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);
  return token;
}

// Үе 2 — имэйл баталгаажуулах холбоос
export default function VerifyEmail() {
  const token = useUrlToken();
  const { user, refresh } = useAuth();
  const [state, setState] = useState(token ? 'loading' : 'error');
  const [msg, setMsg] = useState('Холбоос буруу байна.');

  const sent = useRef(false); // StrictMode-д effect хоёр удаа ажиллах тул нэг удаагийн токеныг давхар илгээхгүй
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post('/api/auth/verify-email', { token })
      .then(() => {
        setState('ok');
        refresh().catch(() => {});
      })
      .catch((ex) => {
        setMsg(ex.message);
        setState('error');
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page crumb={[{ label: 'Имэйл баталгаажуулалт' }]} title="Имэйл баталгаажуулалт">
      <Card className="auth-card">
        {state === 'loading' && <Loading label="Шалгаж байна…" />}
        {state === 'ok' && (
          <>
            <Alert tone="ok">Имэйл хаяг баталгаажлаа. Одоо мэдүүлэг илгээж, мэдэгдэл хүлээн авах боломжтой.</Alert>
            <Link to={user ? HOME_BY_ROLE[user.role] : '/login'}>{user ? 'Самбар руу' : 'Нэвтрэх'}</Link>
          </>
        )}
        {state === 'error' && (
          <>
            <Alert tone="danger">{msg}</Alert>
            <p className="small muted">Нэвтэрсний дараа самбарын дээрх “Дахин илгээх” товчоор шинэ холбоос авна уу.</p>
            <Link to={user ? HOME_BY_ROLE[user.role] : '/login'}>{user ? 'Самбар руу' : 'Нэвтрэх'}</Link>
          </>
        )}
      </Card>
    </Page>
  );
}
