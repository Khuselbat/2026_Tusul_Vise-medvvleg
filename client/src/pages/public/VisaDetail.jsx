import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Badge, Button, Alert, fmtDate, LinkButton } from '../../components/ui.jsx';
import { useAuth } from '../../auth.jsx';

// Зураг 41 Визийн төрөл ба шаардлага
export default function VisaDetail() {
  const { versionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/visas/${versionId}`), [versionId]);
  const v = data?.visa;

  const start = () => {
    const target = `/app/new?version=${v.versionId}`;
    if (!user) navigate(`/login?next=${encodeURIComponent(target)}`);
    else navigate(target);
  };

  return (
    <Page crumb={[{ label: 'Визийн мэдээлэл', to: '/visas' }, { label: v?.code || '…' }]} title={v?.name || 'Визийн төрөл ба шаардлага'}
      subtitle={v && `${v.country.name} · ${v.code} · хувилбар v${v.versionNo}`}
      actions={v && (v.canApply && (!user || user.role === 'APPLICANT')
        ? <Button onClick={start}>Мэдүүлэг эхлүүлэх</Button>
        : null)}>
      <ErrorBox error={error} onRetry={reload} />
      {loading && <Skeleton rows={4} />}
      {v && (
        <>
          {!v.canApply && <Alert tone="warn">{v.blockReason} Мэдээллийг зөвхөн уншиж болно.</Alert>}
          {!v.isLatest && <Alert tone="info">Энэ нь хуучин хувилбар. <Link to="/visas">Сүүлийн мэдээллийг үзэх</Link></Alert>}
          <div className="grid grid-main">
            <Card>
              <h2>Тайлбар</h2>
              <p style={{ whiteSpace: 'pre-line' }}>{v.description || '—'}</p>
              <h2 className="mt">Бүрдүүлэх материал</h2>
              <ol className="stack" style={{ paddingLeft: 18 }}>
                {v.requirements.map((r) => (
                  <li key={r.id}>
                    <div className="between"><strong>{r.title}</strong>{r.isRequired ? <Badge tone="info">Заавал</Badge> : <Badge tone="muted">Хамаарах бол</Badge>}</div>
                    {r.instructions && <p className="muted small mb0">{r.instructions}</p>}
                  </li>
                ))}
              </ol>
              <p className="small muted">Хураамж, шийдвэрлэх хугацааг тогтмол утгаар заахгүй. Албан ёсны мэдэгдлийг эх сурвалжаас шалгана уу.</p>
            </Card>
            <div>
              <Card>
                <h2>Эх сурвалж</h2>
                <dl className="dl" style={{ gridTemplateColumns: '1fr' }}>
                  <div><dt>Эх холбоос</dt><dd>{v.sourceUrl
                    ? <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">{new URL(v.sourceUrl).hostname} ↗</a>
                    : <span className="muted">Тохируулаагүй</span>}</dd></div>
                  <div><dt>Шалгасан огноо</dt><dd>{fmtDate(v.verifiedAt)}</dd></div>
                  <div><dt>Нийтэлсэн</dt><dd>{fmtDate(v.publishedAt)}</dd></div>
                </dl>
              </Card>
              <Card>
                <h2>Албан ёсны хариу</h2>
                <p className="small muted">Визийн шийдвэрийг эрх бүхий байгууллага гаргана. Хариуг албан ёсны порталаас шалгана.</p>
                {v.country.officialResultUrl
                  ? <a className="btn btn-ghost" href={v.country.officialResultUrl} target="_blank" rel="noopener noreferrer">Портал нээх ↗</a>
                  : <Button variant="ghost" disabled>Холбоос тохируулаагүй</Button>}
              </Card>
              {user && user.role !== 'APPLICANT' && <Alert tone="info">Мэдүүлэг зөвхөн мэдүүлэгчийн эрхээр илгээнэ.</Alert>}
              {!user && v.canApply && <LinkButton variant="ghost" to="/register">Бүртгэлгүй бол бүртгүүлэх</LinkButton>}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
