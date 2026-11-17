import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, LinkButton } from '../../components/ui.jsx';
import { ReviewTimeline } from '../../components/shared.jsx';

// Зураг 53 Бүрдлийн үнэлгээний түүх — review_no буурахаар; засах/устгах үйлдэлгүй
import { t } from '../../i18n.js';
export default function ReviewHistory() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/operator/applications/${id}/reviews`), [id]);
  return (
    <Page
      crumb={[
        {
          label: t('Оператор'),
          to: '/operator',
        },
        {
          label: id,
          to: `/operator/applications/${id}`,
        },
        {
          label: t('Түүх'),
        },
      ]}
      title={t('Бүрдлийн үнэлгээний түүх')}
      subtitle={id}
      actions={
        <LinkButton variant="ghost" to={`/operator/applications/${id}`}>
          {t('Мэдүүлэг рүү')}
        </LinkButton>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        data &&
        (data.reviews.length === 0 ? (
          <Empty title={t('Үнэлгээ оруулаагүй')} />
        ) : (
          <Card>
            <ReviewTimeline reviews={data.reviews} />
          </Card>
        ))
      )}
    </Page>
  );
}
