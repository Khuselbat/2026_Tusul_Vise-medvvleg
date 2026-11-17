import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, LinkButton, Alert, fmtDate } from '../../components/ui.jsx';

// Үе 1.3 / тайлан 4.5 — системээс гадуур өгсөн өмнөх мэдүүлгүүд (импортолсон, баталгаажаагүй)
import { t, translateServer } from '../../i18n.js';
export default function Imports() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/imports'), []);
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Өмнөх мэдүүлэг'),
        },
      ]}
      title={t('Өмнөх мэдүүлэг')}
      subtitle={t('Энэ системээс гадуур өгсөн мэдүүлгээ баримтын хамт архивтаа хадгална')}
      actions={<LinkButton to="/app/imports/new">{t('Өмнөх мэдүүлэг нэмэх')}</LinkButton>}
    >
      <Alert tone="info">
        {t('Эдгээр бичлэгийг та өөрөө оруулсан бөгөөд')} <strong>{t('импортолсон, баталгаажаагүй')}</strong>{' '}
        {t('гэж тэмдэглэгдэнэ. Оператор хянахгүй, системд илгээсэн мэдүүлэг болохгүй.')}
      </Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={3} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty
            title={t('Өмнөх мэдүүлэг нэмээгүй байна')}
            action={<LinkButton to="/app/imports/new">{t('Өмнөх мэдүүлэг нэмэх')}</LinkButton>}
          >
            {t('Өмнө нь ЭСЯ, KVAC зэрэгт өгсөн мэдүүлгийнхээ баримтыг энд хадгалж болно.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Дугаар')}</th>
                  <th>{t('Улс · ангилал')}</th>
                  <th>{t('Мэдүүлсэн')}</th>
                  <th>{t('Үр дүн (таны мэдээлснээр)')}</th>
                  <th>{t('Файл')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.publicId}>
                    <td className="mono">{x.publicId}</td>
                    <td>
                      {x.countryName} · {x.visaCategory}
                    </td>
                    <td>{fmtDate(x.appliedOn)}</td>
                    <td>
                      {translateServer(x.outcomeLabel)} <Badge tone="muted">{t('Импортолсон')}</Badge>
                    </td>
                    <td>{x.fileCount}</td>
                    <td>
                      <LinkButton variant="ghost" className="btn-sm" to={`/app/imports/${x.publicId}`}>
                        {t('Дэлгэрэнгүй')}
                      </LinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      <Card className="mt">
        <p className="small muted mb0">{t('Системээр илгээсэн мэдүүлгүүд “Миний архив” хэсэгт тусдаа харагдана.')}</p>
      </Card>
    </Page>
  );
}
