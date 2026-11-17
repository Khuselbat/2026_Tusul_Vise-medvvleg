import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, LinkButton } from '../../components/ui.jsx';

// Зураг 54 Админы хянах самбар — нэгтгэл тоо; хувийн анкет/файл нээх холбоосгүй
export default function AdminDashboard() {
  const { data: d, error, loading, reload } = useAsync(() => api.get('/api/admin/dashboard'), []);
  const n = (x) => x ?? 0;
  return (
    <Page
      crumb={[{ label: 'Админ' }]}
      title="Админы хянах самбар"
      subtitle="Лавлах болон үйл ажиллагааны нэгтгэл"
      actions={
        <>
          <LinkButton to="/admin/assignments">Хуваарилалт</LinkButton>
          <LinkButton variant="ghost" to="/admin/visa-types">
            Визийн лавлах
          </LinkButton>
        </>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        d && (
          <>
            <div className="grid grid-4">
              <Card className="stat">
                <div className="num" style={{ color: d.unassigned ? 'var(--warn)' : undefined }}>
                  {d.unassigned}
                </div>
                <div className="lbl">
                  <Link to="/admin/assignments">Хуваарилаагүй мэдүүлэг →</Link>
                </div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.SUBMITTED) + n(d.applications.IN_REVIEW)}</div>
                <div className="lbl">Хянагдаж буй</div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.INCOMPLETE)}</div>
                <div className="lbl">Нэмэлт материал шаардсан</div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.COMPLETE)}</div>
                <div className="lbl">Бүрдэл бүрэн</div>
              </Card>
            </div>
            <div className="grid grid-3 mt">
              <Card>
                <h2>Улс</h2>
                <p className="mb0">
                  Идэвхтэй: <strong>{n(d.countries.ACTIVE)}</strong> · Тун удахгүй: <strong>{n(d.countries.COMING_SOON)}</strong> ·
                  Хаалттай: <strong>{n(d.countries.DISABLED)}</strong>
                </p>
                <Link to="/admin/countries">Удирдах →</Link>
              </Card>
              <Card>
                <h2>Визийн лавлах</h2>
                <p className="mb0">
                  Төрөл: <strong>{d.visaTypes.total}</strong> (идэвхтэй {d.visaTypes.active}) · Нийтэлсэн хувилбар:{' '}
                  <strong>{d.versions.published}</strong> · Ноорог: <strong>{d.versions.drafts}</strong>
                </p>
                <Link to="/admin/visa-types">Удирдах →</Link>
              </Card>
              <Card>
                <h2>Идэвхтэй хэрэглэгч</h2>
                <p className="mb0">
                  Мэдүүлэгч: <strong>{n(d.activeUsers.APPLICANT)}</strong> · Оператор: <strong>{n(d.activeUsers.OPERATOR)}</strong> · Админ:{' '}
                  <strong>{n(d.activeUsers.ADMIN)}</strong>
                </p>
                <Link to="/admin/users">Удирдах →</Link>
              </Card>
            </div>
            <p className="small muted mt">
              Админы эрх нь мэдүүлэгчийн анкет, хавсралтыг унших эрх биш. Хуваарилалтад зөвхөн лавлах дугаар, төрөл, огноо зэрэг metadata
              харагдана.
            </p>
          </>
        )
      )}
    </Page>
  );
}
