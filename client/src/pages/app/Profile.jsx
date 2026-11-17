import { useState } from 'react';
import { api } from '../../api.js';
import { Page, Card, Field, Button, useToast, DL } from '../../components/ui.jsx';
import { useAuth, ROLE_LABEL } from '../../auth.jsx';

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
    e.preventDefault(); setNameErr('');
    if (name.trim().length < 2) { setNameErr('Нэрээ оруулна уу.'); return; }
    setBusy1(true);
    try { const r = await api.put('/api/auth/me/profile', { displayName: name }); setUser({ ...user, name: r.name }); toast('Нэр хадгалагдлаа.'); } catch (ex) { setNameErr(ex.fields?.displayName || ex.message); } finally { setBusy1(false); }
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
    try { await api.put('/api/auth/me/password', pw); setPw({ currentPassword: '', newPassword: '', newPasswordConfirm: '' }); toast('Нууц үг солигдлоо.'); } catch (ex) { setPwErr(ex.fields || { currentPassword: ex.message }); } finally { setBusy2(false); }
  }

  return (
    <Page crumb={[{ label: ROLE_LABEL[user.role], to: area }, { label: 'Профайл' }]} title="Миний профайл">
      <div className="grid grid-2">
        <Card>
          <h2>Хувийн мэдээлэл</h2>
          <DL items={[['Имэйл', user.email], ['Эрх', ROLE_LABEL[user.role]]]} />
          <form className="stack mt" onSubmit={saveName} noValidate>
            <Field label="Харагдах нэр" htmlFor="dn" error={nameErr}><input id="dn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div><Button type="submit" loading={busy1}>Нэр хадгалах</Button></div>
            {user.role === 'APPLICANT' && <p className="small muted mb0">Өмнө илгээсэн анкетын нэр өөрчлөгдөхгүй.</p>}
          </form>
        </Card>
        <Card>
          <h2>Нууц үг солих</h2>
          <form className="stack" onSubmit={savePw} noValidate>
            <Field label="Одоогийн нууц үг" htmlFor="cp" error={pwErr.currentPassword}><input id="cp" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="Шинэ нууц үг" htmlFor="np" error={pwErr.newPassword}><input id="np" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Шинэ нууц үг давтах" htmlFor="np2" error={pwErr.newPasswordConfirm}><input id="np2" type="password" autoComplete="new-password" value={pw.newPasswordConfirm} onChange={(e) => setPw({ ...pw, newPasswordConfirm: e.target.value })} /></Field>
            <div><Button type="submit" loading={busy2}>Нууц үг солих</Button></div>
          </form>
        </Card>
      </div>
    </Page>
  );
}
