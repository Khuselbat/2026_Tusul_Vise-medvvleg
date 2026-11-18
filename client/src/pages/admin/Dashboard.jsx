import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, LinkButton } from '../../components/ui.jsx';

// Зураг 54 Админы хянах самбар — нэгтгэл тоо; хувийн анкет/файл нээх холбоосгүй
import { t } from '../../i18n.js';
import MailCheck from '../../components/MailCheck.jsx';
export default function AdminDashboard() {
  const { data: d, error, loading, reload } = useAsync(() => api.get('/api/admin/dashboard'), []);
  const n = (x) => x ?? 0;
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
        },
      ]}
      title={t('Админы хянах самбар')}
      subtitle={t('Лавлах болон үйл ажиллагааны нэгтгэл')}
      actions={
        <>
          <LinkButton to="/admin/assignments">{t('Хуваарилалт')}</LinkButton>
          <LinkButton variant="ghost" to="/admin/visa-types">
            {t('Визийн лавлах')}
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
                <div
                  className="num"
                  style={{
                    color: d.unassigned ? 'var(--warn)' : undefined,
                  }}
                >
                  {d.unassigned}
                </div>
                <div className="lbl">
                  <Link to="/admin/assignments">{t('Хуваарилаагүй мэдүүлэг →')}</Link>
                </div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.SUBMITTED) + n(d.applications.IN_REVIEW)}</div>
                <div className="lbl">{t('Хянагдаж буй')}</div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.INCOMPLETE)}</div>
                <div className="lbl">{t('Нэмэлт материал шаардсан')}</div>
              </Card>
              <Card className="stat">
                <div className="num">{n(d.applications.COMPLETE)}</div>
                <div className="lbl">{t('Бүрдэл бүрэн')}</div>
              </Card>
            </div>
            <div className="grid grid-3 mt">
              <Card>
                <h2>{t('Улс')}</h2>
                <p className="mb0">
                  {t('Идэвхтэй:')} <strong>{n(d.countries.ACTIVE)}</strong> {t('· Тун удахгүй:')}{' '}
                  <strong>{n(d.countries.COMING_SOON)}</strong> {t('· Хаалттай:')} <strong>{n(d.countries.DISABLED)}</strong>
                </p>
                <Link to="/admin/countries">{t('Удирдах →')}</Link>
              </Card>
              <Card>
                <h2>{t('Визийн лавлах')}</h2>
                <p className="mb0">
                  {t('Төрөл:')} <strong>{d.visaTypes.total}</strong> {t('(идэвхтэй')} {d.visaTypes.active}
                  {t(') · Нийтэлсэн хувилбар:')} <strong>{d.versions.published}</strong> {t('· Ноорог:')}{' '}
                  <strong>{d.versions.drafts}</strong>
                </p>
                <Link to="/admin/visa-types">{t('Удирдах →')}</Link>
              </Card>
              <Card>
                <h2>{t('Идэвхтэй хэрэглэгч')}</h2>
                <p className="mb0">
                  {t('Мэдүүлэгч:')} <strong>{n(d.activeUsers.APPLICANT)}</strong> {t('· Оператор:')}{' '}
                  <strong>{n(d.activeUsers.OPERATOR)}</strong> {t('· Админ:')} <strong>{n(d.activeUsers.ADMIN)}</strong>
                </p>
                <Link to="/admin/users">{t('Удирдах →')}</Link>
              </Card>
            </div>
            <div className="mt">
              <MailCheck />
            </div>
            <p className="small muted mt">
              {t(
                'Админы эрх нь мэдүүлэгчийн анкет, хавсралтыг унших эрх биш. Хуваарилалтад зөвхөн лавлах дугаар, төрөл, огноо зэрэг metadata харагдана.',
              )}
            </p>
          </>
        )
      )}
    </Page>
  );
}
