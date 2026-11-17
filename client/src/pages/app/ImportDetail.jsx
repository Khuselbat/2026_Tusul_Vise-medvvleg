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
import { FileViewer, asEvidence } from '../../components/shared.jsx';

// Үе 1.3 — Импортолсон мэдүүлгийн дэлгэрэнгүй (зөвхөн уншина; устгаж болно)
export default function ImportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/imports/${id}`), [id]);
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
      navigate('/app/imports', { replace: true });
    } catch (ex) {
      setDelErr(ex);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Өмнөх мэдүүлэг', to: '/app/imports' }, { label: id }]}
      title="Өмнөх мэдүүлэг"
      subtitle={x && `${x.countryName} · ${x.visaCategory}`}
      actions={
        x && (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Устгах
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
                <h2>Мэдээлэл</h2>
                <Badge tone="muted">Импортолсон · баталгаажаагүй</Badge>
              </div>
              <DL
                items={[
                  [
                    'Дугаар',
                    <span key="id" className="mono">
                      {x.publicId}
                    </span>,
                  ],
                  ['Улс', x.countryName],
                  ['Визийн ангилал', x.visaCategory],
                  ['Мэдүүлсэн огноо', fmtDate(x.appliedOn)],
                  x.authority && ['Хаана өгсөн', x.authority],
                  x.officialRef && ['Хүлээн авсан дугаар', x.officialRef],
                  ['Үр дүн (таны мэдээлснээр)', x.outcomeLabel],
                  x.note && ['Тэмдэглэл', x.note],
                  ['Нэмсэн', fmtDateTime(x.createdAt)],
                ]}
              />
              <Alert tone="info">Таны оруулсан мэдээлэл — систем үүнийг шалгаж баталгаажуулаагүй, визийн шийдвэр биш.</Alert>
            </Card>
            <Card>
              <h2>Баримт</h2>
              {x.files.length === 0 ? (
                <p className="muted">Баримт хавсаргаагүй.</p>
              ) : (
                x.files.map((f) => (
                  <div key={f.id} className="file-line">
                    <button className="btn-link" onClick={() => setViewing(asEvidence(f))}>
                      {f.originalName}
                    </button>
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
        title="Энэ бичлэгийг устгах уу?"
        tone="danger"
        confirmLabel="Устгах"
        loading={busy}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={remove}
      >
        Бичлэг болон хавсаргасан бүх баримт бүрмөсөн устна. Буцаах боломжгүй.
      </Confirm>
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
