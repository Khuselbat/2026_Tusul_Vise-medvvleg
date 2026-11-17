import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Button, Alert, ErrorBox, Skeleton, useAsync, Confirm } from '../../components/ui.jsx';
import { Steps, FormSummary, DocumentList, FileViewer } from '../../components/shared.jsx';

// Зураг 45 Мэдүүлгээ хянаж илгээх — нэг транзакц, давтан дарахад давхар үүсэхгүй
export default function NewConfirm() {
  const [sp] = useSearchParams();
  const ref = sp.get('draft');
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/drafts/${ref}`), [ref]);
  const [agree, setAgree] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [viewing, setViewing] = useState(null);
  if (!ref) return <Navigate to="/app/new" replace />;
  const d = data?.draft;

  async function submit() {
    setBusy(true); setSubmitErr(null);
    try {
      const r = await api.post(`/api/app/drafts/${ref}/submit`);
      navigate(`/app/submitted/${r.publicId}`, { replace: true });
    } catch (ex) {
      setSubmitErr(ex);
      setOpen(false);
      if (ex.status === 404) {
        // Өмнө илгээгдсэн байж болно
        navigate(`/app/applications/${ref}`, { replace: true });
      }
    } finally { setBusy(false); }
  }

  return (
    <Page crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Шинэ мэдүүлэг' }]} title="Мэдүүлгээ хянаж илгээх" subtitle={d && `${d.visa.country.name} · ${d.visa.code} — ${d.visa.name}`}>
      <Steps current={2} />
      <ErrorBox error={error} onRetry={reload} />
      {submitErr && (
        <Alert tone="danger" title={submitErr.message}>
          {submitErr.missing?.length ? (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {submitErr.missing.map((m, i) => (
                <li key={i}>{m.message} — <Link to={m.step === 'form' ? `/app/new?draft=${ref}` : `/app/new/documents?draft=${ref}`}>засах</Link></li>
              ))}
            </ul>
          ) : 'Таны оруулсан мэдээлэл хадгалагдсан хэвээр байна. Дахин оролдоно уу.'}
        </Alert>
      )}
      {loading && !d ? <Skeleton rows={5} /> : d && (
        <>
          <Card>
            <div className="between"><h2>Анкет</h2><Link to={`/app/new?draft=${ref}`}>Засах</Link></div>
            <FormSummary form={d.form} />
          </Card>
          <Card>
            <div className="between"><h2>Хавсралт</h2><Link to={`/app/new/documents?draft=${ref}`}>Засах</Link></div>
            <DocumentList requirements={d.requirements} documents={d.documents} onOpen={setViewing} />
          </Card>
          <Card>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>Оруулсан мэдээлэл үнэн зөв болохыг баталж байна. Илгээсний дараа анкет, хавсралтыг засах боломжгүй, архивт хадгалагдана гэдгийг ойлгосон. Энэ нь ЭСЯ-нд албан ёсоор мэдүүлсэн гэсэн үг биш болохыг ойлгосон.</span>
            </label>
          </Card>
          <div className="page-footer">
            <Button disabled={!agree || !d.canSubmit} onClick={() => setOpen(true)}>Илгээх</Button>
            <Button variant="ghost" onClick={() => navigate(`/app/new/documents?draft=${ref}`)}>Буцах</Button>
          </div>
        </>
      )}
      <Confirm open={open} title="Мэдүүлгийг илгээх үү?" confirmLabel="Илгээх" loading={busy} onClose={() => !busy && setOpen(false)} onConfirm={submit}>
        Илгээсний дараа дотоод лавлах дугаар олгогдож, мэдүүлэг операторын хяналтад шилжинэ.
      </Confirm>
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
