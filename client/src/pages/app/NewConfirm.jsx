import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, Button, Alert, ErrorBox, Skeleton, useAsync, Confirm } from '../../components/ui.jsx';
import { Steps, FormSummary, DocumentList, FileViewer } from '../../components/shared.jsx';

// Зураг 45 Мэдүүлгээ хянаж илгээх — нэг транзакц, давтан дарахад давхар үүсэхгүй
import { t } from '../../i18n.js';
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
    setBusy(true);
    setSubmitErr(null);
    try {
      const r = await api.post(`/api/app/drafts/${ref}/submit`);
      navigate(`/app/submitted/${r.publicId}`, {
        replace: true,
      });
    } catch (ex) {
      setSubmitErr(ex);
      setOpen(false);
      if (ex.status === 404) {
        // Өмнө илгээгдсэн байж болно
        navigate(`/app/applications/${ref}`, {
          replace: true,
        });
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Шинэ мэдүүлэг'),
        },
      ]}
      title={t('Мэдүүлгээ хянаж илгээх')}
      subtitle={d && `${d.visa.country.name} · ${d.visa.code} — ${d.visa.name}`}
    >
      <Steps current={2} />
      <ErrorBox error={error} onRetry={reload} />
      {submitErr && (
        <Alert tone="danger" title={submitErr.message}>
          {submitErr.missing?.length ? (
            <ul
              style={{
                margin: '6px 0 0',
                paddingLeft: 18,
              }}
            >
              {submitErr.missing.map((m, i) => (
                <li key={i}>
                  {m.message} —{' '}
                  <Link to={m.step === 'form' ? `/app/new?draft=${ref}` : `/app/new/documents?draft=${ref}`}>{t('засах')}</Link>
                </li>
              ))}
            </ul>
          ) : (
            t('Таны оруулсан мэдээлэл хадгалагдсан хэвээр байна. Дахин оролдоно уу.')
          )}
        </Alert>
      )}
      {loading && !d ? (
        <Skeleton rows={5} />
      ) : (
        d && (
          <>
            <Card>
              <div className="between">
                <h2>{t('Анкет')}</h2>
                <Link to={`/app/new?draft=${ref}`}>{t('Засах')}</Link>
              </div>
              <FormSummary form={d.form} />
            </Card>
            <Card>
              <div className="between">
                <h2>{t('Хавсралт')}</h2>
                <Link to={`/app/new/documents?draft=${ref}`}>{t('Засах')}</Link>
              </div>
              <DocumentList requirements={d.requirements} documents={d.documents} onOpen={setViewing} />
            </Card>
            {d.documents.some((x) => x.fromProfile) && (
              <Alert tone="info">
                {t(
                  'Зарим хавсралтыг бичиг баримтын сангаас автоматаар хуулсан (“Профайлаас” тэмдэгтэй). Тэдгээр нь энэ мэдүүлэгт тохирох, хүчинтэй эсэхийг шалгана уу.',
                )}
              </Alert>
            )}
            <Card>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  {t(
                    'Профайлаас автоматаар бөглөсөн мэдээлэл, хавсралтыг оролцуулан оруулсан мэдээлэл үнэн зөв болохыг шалгаж баталж байна. Илгээсний дараа анкет, хавсралтыг засах боломжгүй, архивт хадгалагдана гэдгийг ойлгосон. Энэ нь ЭСЯ-нд албан ёсоор мэдүүлсэн гэсэн үг биш болохыг ойлгосон.',
                  )}
                </span>
              </label>
            </Card>
            <div className="page-footer">
              <Button disabled={!agree || !d.canSubmit} onClick={() => setOpen(true)}>
                {t('Илгээх')}
              </Button>
              <Button variant="ghost" onClick={() => navigate(`/app/new/documents?draft=${ref}`)}>
                {t('Буцах')}
              </Button>
            </div>
          </>
        )
      )}
      <Confirm
        open={open}
        title={t('Мэдүүлгийг илгээх үү?')}
        confirmLabel={t('Илгээх')}
        loading={busy}
        onClose={() => !busy && setOpen(false)}
        onConfirm={submit}
      >
        {t('Илгээсний дараа дотоод лавлах дугаар олгогдож, мэдүүлэг операторын хяналтад шилжинэ.')}
      </Confirm>
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
