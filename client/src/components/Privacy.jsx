// Үе 3 — мэдүүлэгчийн хувийн мэдээлэл: бүгдийг ZIP-ээр татах, бүртгэл устгах хүсэлт (тайлан 4.5).
import { useState } from 'react';
import { api, downloadPost } from '../api.js';
import { Card, Button, Field, Alert, Badge, Modal, useAsync, ErrorBox, Skeleton, useToast, fmtDateTime } from './ui.jsx';

const STATUS = {
  PENDING: ['info', 'Хянагдаж байна'],
  APPROVED: ['ok', 'Устгагдсан'],
  REJECTED: ['danger', 'Татгалзсан'],
  CANCELLED: ['muted', 'Цуцалсан'],
};

function PasswordModal({ title, children, confirmLabel, tone = 'primary', withReason, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e?.preventDefault();
    if (!password) {
      setErr('Нууц үгээ оруулна уу.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await onSubmit({ password, reason });
    } catch (ex) {
      setErr(ex.fields?.password || ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={title}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Болих
          </Button>
          <Button variant={tone} onClick={go} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <form onSubmit={go} noValidate className="stack">
        <Field label="Нууц үгээ дахин оруулна уу" htmlFor="pv-pw" error={err}>
          <input
            id="pv-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        {withReason && (
          <Field label="Шалтгаан (сонголттой)" htmlFor="pv-reason">
            <textarea id="pv-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

export function PrivacyCard({ onErased }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/privacy/deletion'), []);
  const [modal, setModal] = useState(null); // 'export' | 'delete'
  const req = data?.request;
  const pending = req?.status === 'PENDING';

  async function cancel() {
    await api.del('/api/app/privacy/deletion');
    toast('Устгах хүсэлт цуцлагдлаа.');
    reload();
  }

  return (
    <Card className="mt">
      <h2>Миний мэдээлэл</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Системд хадгалагдаж буй бүх мэдээллээ (анкет, хавсралт, архив, мэдэгдэл) нэг ZIP файлаар татаж авах, эсвэл бүртгэлээ устгуулах
        хүсэлт гаргах боломжтой.
      </p>
      <ErrorBox error={error} onRetry={reload} />
      <div className="row-actions">
        <Button variant="ghost" onClick={() => setModal('export')}>
          Бүх мэдээллээ татах (ZIP)
        </Button>
        {!pending && (
          <Button variant="ghost" className="danger" onClick={() => setModal('delete')}>
            Бүртгэл устгах хүсэлт
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Skeleton rows={1} />
      ) : (
        req && (
          <div className="mt">
            <span className="small muted">Сүүлийн устгах хүсэлт ({fmtDateTime(req.requestedAt)}): </span>
            <Badge tone={STATUS[req.status][0]}>{STATUS[req.status][1]}</Badge>
            {req.decisionNote && <div className="small muted">Тайлбар: {req.decisionNote}</div>}
            {pending && (
              <div className="mt">
                <Button variant="ghost" className="btn-sm" onClick={cancel}>
                  Хүсэлтээ цуцлах
                </Button>
              </div>
            )}
          </div>
        )
      )}
      {data?.activeApplications > 0 && !pending && (
        <p className="small muted mb0 mt">
          Танд хянагдаж буй {data.activeApplications} мэдүүлэг байна — устгах хүсэлтийг тэдгээрийн бүрдлийн хяналт дууссаны дараа
          шийдвэрлэнэ.
        </p>
      )}
      {modal === 'export' && (
        <PasswordModal
          title="Бүх мэдээллээ татах"
          confirmLabel="Татах"
          onClose={() => setModal(null)}
          onSubmit={async ({ password }) => {
            await downloadPost('/api/app/privacy/export', { password }, 'civiz-export.zip');
            setModal(null);
            toast('Мэдээллийн ZIP татагдлаа.');
          }}
        >
          <Alert tone="warn">Файлд паспортын дугаар зэрэг нууц мэдээлэл бүтнээр орно. Найдвартай газар хадгална уу.</Alert>
        </PasswordModal>
      )}
      {modal === 'delete' && (
        <PasswordModal
          title="Бүртгэл устгах хүсэлт"
          confirmLabel="Хүсэлт илгээх"
          tone="danger"
          withReason
          onClose={() => setModal(null)}
          onSubmit={async ({ password, reason }) => {
            await api.post('/api/app/privacy/deletion', { password, reason });
            setModal(null);
            toast('Устгах хүсэлт илгээгдлээ. Админ хянаж шийдвэрлэнэ.');
            reload();
            onErased?.();
          }}
        >
          <Alert tone="danger" title="Буцаах боломжгүй">
            Админ баталгаажуулсны дараа таны анкет, бүх хавсралт, импорт, мэдэгдэл бүрмөсөн устаж, нэвтрэх боломжгүй болно. Илгээсэн
            мэдүүлгийн лавлах дугаар, огноо нэргүй статистик хэлбэрээр үлдэнэ. Хэрэгтэй бол эхлээд мэдээллээ татаж аваарай.
          </Alert>
        </PasswordModal>
      )}
    </Card>
  );
}
