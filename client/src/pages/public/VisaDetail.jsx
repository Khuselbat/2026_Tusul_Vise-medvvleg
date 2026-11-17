import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Badge, Button, Alert, fmtDate, LinkButton } from '../../components/ui.jsx';
import { RequirementMeta } from '../../components/shared.jsx';
import { useAuth } from '../../auth.jsx';

// Зураг 41 Визийн төрөл ба шаардлага
import { t } from '../../i18n.js';
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
    <Page
      crumb={[
        {
          label: t('Визийн мэдээлэл'),
          to: '/visas',
        },
        {
          label: v?.code || '…',
        },
      ]}
      title={v?.name || t('Визийн төрөл ба шаардлага')}
      subtitle={
        v &&
        t('{{v0}} · {{v1}} · хувилбар v{{v2}}', {
          v0: v.country.name,
          v1: v.code,
          v2: v.versionNo,
        })
      }
      actions={v && (v.canApply && (!user || user.role === 'APPLICANT') ? <Button onClick={start}>{t('Мэдүүлэг эхлүүлэх')}</Button> : null)}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading && <Skeleton rows={4} />}
      {v && (
        <>
          {!v.canApply && (
            <Alert tone="warn">
              {v.blockReason} {t('Мэдээллийг зөвхөн уншиж болно.')}
            </Alert>
          )}
          {!v.isLatest && (
            <Alert tone="info">
              {t('Энэ нь хуучин хувилбар.')} <Link to="/visas">{t('Сүүлийн мэдээллийг үзэх')}</Link>
            </Alert>
          )}
          <div className="grid grid-main">
            <Card>
              <h2>{t('Тайлбар')}</h2>
              <p
                style={{
                  whiteSpace: 'pre-line',
                }}
              >
                {v.description || '—'}
              </p>
              <h2 className="mt">{t('Бүрдүүлэх материал')}</h2>
              <ol
                className="stack"
                style={{
                  paddingLeft: 18,
                }}
              >
                {v.requirements.map((r) => (
                  <li key={r.id}>
                    <div className="between">
                      <strong>{r.title}</strong>
                      {r.isRequired ? <Badge tone="info">{t('Заавал')}</Badge> : <Badge tone="muted">{t('Хамаарах бол')}</Badge>}
                    </div>
                    {r.instructions && <p className="muted small mb0">{r.instructions}</p>}
                    <RequirementMeta r={r} />
                  </li>
                ))}
              </ol>
              <p className="small muted">
                {t('Хураамж, шийдвэрлэх хугацааг тогтмол утгаар заахгүй. Албан ёсны мэдэгдлийг эх сурвалжаас шалгана уу.')}
              </p>
            </Card>
            <div>
              <Card>
                <h2>{t('Эх сурвалж')}</h2>
                <dl
                  className="dl"
                  style={{
                    gridTemplateColumns: '1fr',
                  }}
                >
                  <div>
                    <dt>{t('Эх холбоос')}</dt>
                    <dd>
                      {v.sourceUrl ? (
                        <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {new URL(v.sourceUrl).hostname} ↗
                        </a>
                      ) : (
                        <span className="muted">{t('Тохируулаагүй')}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Шалгасан огноо')}</dt>
                    <dd>{fmtDate(v.verifiedAt)}</dd>
                  </div>
                  <div>
                    <dt>{t('Нийтэлсэн')}</dt>
                    <dd>{fmtDate(v.publishedAt)}</dd>
                  </div>
                </dl>
              </Card>
              <Card>
                <h2>{t('Албан ёсны хариу')}</h2>
                <p className="small muted">{t('Визийн шийдвэрийг эрх бүхий байгууллага гаргана. Хариуг албан ёсны порталаас шалгана.')}</p>
                {v.country.officialResultUrl ? (
                  <a className="btn btn-ghost" href={v.country.officialResultUrl} target="_blank" rel="noopener noreferrer">
                    {t('Портал нээх ↗')}
                  </a>
                ) : (
                  <Button variant="ghost" disabled>
                    {t('Холбоос тохируулаагүй')}
                  </Button>
                )}
              </Card>
              {user && user.role !== 'APPLICANT' && <Alert tone="info">{t('Мэдүүлэг зөвхөн мэдүүлэгчийн эрхээр илгээнэ.')}</Alert>}
              {!user && v.canApply && (
                <LinkButton variant="ghost" to="/register">
                  {t('Бүртгэлгүй бол бүртгүүлэх')}
                </LinkButton>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
