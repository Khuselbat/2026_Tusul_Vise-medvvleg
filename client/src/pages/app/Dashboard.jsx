import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, LinkButton, fmtDate } from '../../components/ui.jsx';
import { NotDecisionNote } from '../../components/shared.jsx';
import { useAuth } from '../../auth.jsx';

// Зураг 42 Мэдүүлэгчийн хянах самбар
import { t } from '../../i18n.js';
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/dashboard'), []);
  const c = data?.counts;
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
        },
      ]}
      title={t('Хянах самбар')}
      subtitle={t('Сайн байна уу, {{v0}}', {
        v0: user.name,
      })}
      actions={
        <>
          <LinkButton to="/app/new">{t('Шинэ мэдүүлэг')}</LinkButton>
          <LinkButton variant="ghost" to="/app/applications">
            {t('Архив үзэх')}
          </LinkButton>
        </>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        data && (
          <>
            <div className="grid grid-4">
              <Card className="stat">
                <div className="num">{c.submitted}</div>
                <div className="lbl">{t('Илгээсэн мэдүүлэг')}</div>
              </Card>
              <Card className="stat">
                <div className="num">{c.inReview}</div>
                <div className="lbl">{t('Бүрдэл хянаж байна')}</div>
              </Card>
              <Card className="stat">
                <div
                  className="num"
                  style={{
                    color: c.incomplete ? 'var(--warn)' : undefined,
                  }}
                >
                  {c.incomplete}
                </div>
                <div className="lbl">{t('Нэмэлт материал шаардсан')}</div>
              </Card>
              <Card className="stat">
                <div className="num">{c.complete + (c.delivered || 0)}</div>
                <div className="lbl">{t('Бүрдэл бүрэн · хүргүүлсэн')}</div>
              </Card>
            </div>

            {data.drafts.length > 0 && (
              <Card className="mt">
                <h2>{t('Дуусаагүй ноорог')}</h2>
                <div className="stack">
                  {data.drafts.map((d) => (
                    <div key={d.publicId} className="between">
                      <div>
                        <strong>{d.visaName}</strong>
                        <div className="small muted">
                          {t('Үүсгэсэн')} {fmtDate(d.createdAt)}
                        </div>
                      </div>
                      <LinkButton variant="ghost" className="btn-sm" to={`/app/new?draft=${d.publicId}`}>
                        {t('Үргэлжлүүлэх')}
                      </LinkButton>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="mt">
              <div className="between">
                <h2>{t('Сүүлийн мэдүүлгүүд')}</h2>
                <Link to="/app/applications">{t('Бүгдийг харах →')}</Link>
              </div>
              {data.recent.length === 0 ? (
                <Empty title={t('Мэдүүлэг алга')} action={<LinkButton to="/app/new">{t('Анхны мэдүүлгээ үүсгэх')}</LinkButton>}>
                  {t('Визийн мэдээллээ уншаад анхны мэдүүлгээ илгээгээрэй.')}
                </Empty>
              ) : (
                <div
                  className="table-wrap"
                  style={{
                    boxShadow: 'none',
                  }}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Лавлах дугаар')}</th>
                        <th>{t('Визийн төрөл')}</th>
                        <th>{t('Илгээсэн')}</th>
                        <th>{t('Бүрдлийн төлөв')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((a) => (
                        <tr key={a.publicId}>
                          <td className="mono">{a.publicId}</td>
                          <td>
                            {a.country} · {a.visaCode}
                          </td>
                          <td>{fmtDate(a.submittedAt)}</td>
                          <td>
                            <Badge status={a.status} />
                          </td>
                          <td>
                            <Link to={`/app/applications/${a.publicId}`}>{t('Дэлгэрэнгүй')}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt">
                <NotDecisionNote />
              </div>
            </Card>
          </>
        )
      )}
    </Page>
  );
}
