import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, LinkButton, useAsync, ErrorBox, Skeleton, fmtDateTime } from '../../components/ui.jsx';

// Зураг 46 Мэдүүлэг амжилттай илгээгдсэн — сервер хадгалсны дараа л харагдана
import { t } from '../../i18n.js';
export default function Submitted() {
  const { id } = useParams();
  const { data, error, loading } = useAsync(() => api.get(`/api/app/applications/${id}`), [id]);
  const a = data?.application;
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Илгээгдсэн'),
        },
      ]}
      title={t('Мэдүүлэг амжилттай илгээгдлээ')}
    >
      <ErrorBox error={error} />
      {loading ? (
        <Skeleton rows={2} />
      ) : (
        a && (
          <Card>
            <div
              className="alert alert-ok"
              style={{
                marginBottom: 20,
              }}
            >
              {t('Таны мэдүүлэг, анкет, бүх хавсралт архивт хадгалагдлаа.')}
            </div>
            <div className="small muted">{t('Дотоод лавлах дугаар')}</div>
            <div className="ref">{a.publicId}</div>
            <p className="muted">
              {t('Илгээсэн:')} {fmtDateTime(a.submittedAt)} · {a.visa.country.name} · {a.visa.code}
            </p>
            <p className="small muted">
              {t(
                'Энэ дугаар нь консулын визийн дугаар биш. Оператор материалын бүрдлийг шалгаж, үр дүнг таны самбарт харуулна. Албан ёсны визийн хариуг Korea Visa Portal-аас шалгана.',
              )}
            </p>
            <div className="row-actions">
              <LinkButton to={`/app/applications/${a.publicId}`}>{t('Мэдүүлгээ харах')}</LinkButton>
              <LinkButton variant="ghost" to="/app">
                {t('Хянах самбар')}
              </LinkButton>
            </div>
          </Card>
        )
      )}
    </Page>
  );
}
