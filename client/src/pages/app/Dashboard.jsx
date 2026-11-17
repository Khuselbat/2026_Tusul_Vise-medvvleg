import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, LinkButton, fmtDate } from '../../components/ui.jsx';
import { NotDecisionNote } from '../../components/shared.jsx';
import { useAuth } from '../../auth.jsx';

// Зураг 42 Мэдүүлэгчийн хянах самбар
export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/dashboard'), []);
  const c = data?.counts;
  return (
    <Page
      crumb={[{ label: 'Мэдүүлэгч' }]}
      title="Хянах самбар"
      subtitle={`Сайн байна уу, ${user.name}`}
      actions={
        <>
          <LinkButton to="/app/new">Шинэ мэдүүлэг</LinkButton>
          <LinkButton variant="ghost" to="/app/applications">
            Архив үзэх
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
                <div className="lbl">Илгээсэн мэдүүлэг</div>
              </Card>
              <Card className="stat">
                <div className="num">{c.inReview}</div>
                <div className="lbl">Бүрдэл хянаж байна</div>
              </Card>
              <Card className="stat">
                <div className="num" style={{ color: c.incomplete ? 'var(--warn)' : undefined }}>
                  {c.incomplete}
                </div>
                <div className="lbl">Нэмэлт материал шаардсан</div>
              </Card>
              <Card className="stat">
                <div className="num">{c.complete}</div>
                <div className="lbl">Бүрдэл бүрэн</div>
              </Card>
            </div>

            {data.drafts.length > 0 && (
              <Card className="mt">
                <h2>Дуусаагүй ноорог</h2>
                <div className="stack">
                  {data.drafts.map((d) => (
                    <div key={d.publicId} className="between">
                      <div>
                        <strong>{d.visaName}</strong>
                        <div className="small muted">Үүсгэсэн {fmtDate(d.createdAt)}</div>
                      </div>
                      <LinkButton variant="ghost" className="btn-sm" to={`/app/new?draft=${d.publicId}`}>
                        Үргэлжлүүлэх
                      </LinkButton>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="mt">
              <div className="between">
                <h2>Сүүлийн мэдүүлгүүд</h2>
                <Link to="/app/applications">Бүгдийг харах →</Link>
              </div>
              {data.recent.length === 0 ? (
                <Empty title="Мэдүүлэг алга" action={<LinkButton to="/app/new">Анхны мэдүүлгээ үүсгэх</LinkButton>}>
                  Визийн мэдээллээ уншаад анхны мэдүүлгээ илгээгээрэй.
                </Empty>
              ) : (
                <div className="table-wrap" style={{ boxShadow: 'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Лавлах дугаар</th>
                        <th>Визийн төрөл</th>
                        <th>Илгээсэн</th>
                        <th>Бүрдлийн төлөв</th>
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
                            <Link to={`/app/applications/${a.publicId}`}>Дэлгэрэнгүй</Link>
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
