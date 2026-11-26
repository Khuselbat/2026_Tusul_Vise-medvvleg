import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, fmtDateTime, TableWrap } from '../../components/ui.jsx';
import { t } from '../../i18n.js';
export default function MyReviews() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/operator/reviews'), []);
  return (
    <Page
      crumb={[
        {
          label: t('Оператор'),
          to: '/operator',
        },
        {
          label: t('Үнэлгээний түүх'),
        },
      ]}
      title={t('Миний үнэлгээний түүх')}
      subtitle={t('Таны оруулсан бүх бүрдлийн үнэлгээ')}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={4} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={t('Үнэлгээ оруулаагүй байна')} />
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>{t('Огноо')}</th>
                  <th>{t('Лавлах дугаар')}</th>
                  <th>{t('Төрөл')}</th>
                  <th>#</th>
                  <th>{t('Үнэлгээ')}</th>
                  <th>{t('Тайлбар')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.publicId}-${r.reviewNo}`}>
                    <td>{fmtDateTime(r.reviewedAt)}</td>
                    <td className="mono">
                      {r.stillAssigned ? <Link to={`/operator/applications/${r.publicId}`}>{r.publicId}</Link> : r.publicId}
                    </td>
                    <td>{r.visaCode}</td>
                    <td>{r.reviewNo}</td>
                    <td>
                      <Badge tone={r.completeness === 'COMPLETE' ? 'ok' : 'warn'}>
                        {r.completeness === 'COMPLETE' ? t('Бүрэн') : t('Дутуу')}
                      </Badge>
                    </td>
                    <td className="small">{r.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
    </Page>
  );
}
