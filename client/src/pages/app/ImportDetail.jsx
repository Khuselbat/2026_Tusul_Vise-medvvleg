import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  Card,
  useAsync,
  ErrorBox,
  Skeleton,
  Badge,
  Button,
  Confirm,
  Alert,
  DL,
  fmtDate,
  fmtDateTime,
  fmtBytes,
} from '../../components/ui.jsx';
import { FileViewer, asEvidence, usePendingScanPoll, FileOpenButton } from '../../components/shared.jsx';

// Үе 1.3 — Импортолсон мэдүүлгийн дэлгэрэнгүй (зөвхөн уншина; устгаж болно)
import { t, translateServer } from '../../i18n.js';
export default function ImportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/imports/${id}`), [id]);
  usePendingScanPoll(data, reload);
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState(null);
  const x = data?.item;
  async function remove() {
    setBusy(true);
    setDelErr(null);
    try {
      await api.del(`/api/app/imports/${id}`);
      navigate('/app/imports', {
        replace: true,
      });
    } catch (ex) {
      setDelErr(ex);
      setConfirm(false);
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
          label: t('Өмнөх мэдүүлэг'),
          to: '/app/imports',
        },
        {
          label: id,
        },
      ]}
      title={t('Өмнөх мэдүүлэг')}
      subtitle={x && `${x.countryName} · ${x.visaCategory}`}
      actions={
        x && (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            {t('Устгах')}
          </Button>
        )
      }
    >
      <ErrorBox error={error || delErr} onRetry={error ? reload : undefined} />
      {loading && !x ? (
        <Skeleton rows={4} />
      ) : (
        x && (
          <div className="grid grid-main">
            <Card>
              <div className="between">
                <h2>{t('Мэдээлэл')}</h2>
                <Badge tone="muted">{t('Импортолсон · баталгаажаагүй')}</Badge>
              </div>
              <DL
                items={[
                  [
                    t('Дугаар'),
                    <span key="id" className="mono">
                      {x.publicId}
                    </span>,
                  ],
                  [t('Улс'), x.countryName],
                  [t('Визийн ангилал'), x.visaCategory],
                  [t('Мэдүүлсэн огноо'), fmtDate(x.appliedOn)],
                  x.authority && [t('Хаана өгсөн'), x.authority],
                  x.officialRef && [t('Хүлээн авсан дугаар'), x.officialRef],
                  [t('Үр дүн (таны мэдээлснээр)'), translateServer(x.outcomeLabel)],
                  x.note && [t('Тэмдэглэл'), x.note],
                  [t('Нэмсэн'), fmtDateTime(x.createdAt)],
                ]}
              />
              <Alert tone="info">{t('Таны оруулсан мэдээлэл — систем үүнийг шалгаж баталгаажуулаагүй, визийн шийдвэр биш.')}</Alert>
            </Card>
            <Card>
              <h2>{t('Баримт')}</h2>
              {x.files.length === 0 ? (
                <p className="muted">{t('Баримт хавсаргаагүй.')}</p>
              ) : (
                x.files.map((f) => (
                  <div key={f.id} className="file-line">
                    <FileOpenButton doc={asEvidence(f)} onOpen={setViewing} />
                    <span>{fmtBytes(f.sizeBytes)}</span>
                  </div>
                ))
              )}
            </Card>
          </div>
        )
      )}
      <Confirm
        open={confirm}
        title={t('Энэ бичлэгийг устгах уу?')}
        tone="danger"
        confirmLabel={t('Устгах')}
        loading={busy}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={remove}
      >
        {t('Бичлэг болон хавсаргасан бүх баримт бүрмөсөн устна. Буцаах боломжгүй.')}
      </Confirm>
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
