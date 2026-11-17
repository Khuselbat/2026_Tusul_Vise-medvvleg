import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, LinkButton, useAsync, ErrorBox, Skeleton } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

// Зураг 37 Нүүр хуудас — дөрвөн улсын карт; зөвхөн идэвхтэй улсын үйлчилгээг сонгоно
import { t } from '../../i18n.js';
export default function Home() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/countries'), []);
  const countries = data?.countries || [];
  // Бусад улсын нэр баталгаажаагүй бол "Улс N" гэсэн хаалттай карт харуулна (тайлангийн 1-р бүлэг)
  const cards = [...countries];
  for (let i = cards.length; i < 4; i += 1)
    cards.push({
      placeholder: true,
      name: t('Улс {{v0}}', {
        v0: i + 1,
      }),
      status: 'COMING_SOON',
    });
  return (
    <Page
      crumb={[
        {
          label: user ? t('Нүүр') : t('Зочин'),
        },
      ]}
      title={t('Нүүр хуудас')}
      subtitle={t('Визийн мэдээлэл, мэдүүлэг, архивыг нэг дор')}
    >
      <div className="hero">
        <h2>{t('Визийн мэдээлэл нэг дор')}</h2>
        <p>{t('Шаардлагаа уншиж, материалаа бүрдүүлээд мэдүүлгээ илгээнэ.')}</p>
        <div className="row-actions">
          <LinkButton to="/visas">{t('Визийн мэдээлэл үзэх')}</LinkButton>
          {user ? (
            <LinkButton variant="ghost" to={HOME_BY_ROLE[user.role]}>
              {t('Миний самбар')}
            </LinkButton>
          ) : (
            <LinkButton variant="ghost" to="/register">
              {t('Бүртгүүлэх')}
            </LinkButton>
          )}
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={2} />
      ) : (
        <div className="grid grid-2">
          {cards.slice(0, Math.max(4, cards.length)).map((c, i) => (
            <Card key={c.id || `p${i}`} className={`country-card ${c.submittable ? '' : 'disabled'}`}>
              <h3>{t(c.name) /* мэдэгдэж буй улсын нэрийг орчуулна (ж: БНСУ) */}</h3>
              <div className="state">
                {c.placeholder ? t('Нэрийг баталгаажуулна') : c.submittable ? t('Үйлчилгээ нээлттэй') : t('Мэдүүлэг авахгүй байна')}
              </div>
              {c.submittable ? (
                <Link className="cta" to={`/visas?country=${c.iso}`}>
                  {t('Мэдээлэл үзэх →')}
                </Link>
              ) : (
                <span
                  className="cta"
                  style={{
                    color: 'var(--muted)',
                  }}
                  aria-disabled
                >
                  {t('Тун удахгүй')}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
      <Card className="mt">
        <h2>{t('Энэ систем юу хийдэг вэ?')}</h2>
        <div className="grid grid-3 small">
          <div>
            <strong>{t('1. Мэдээлэл унших')}</strong>
            <p className="muted">{t('Ангилал бүрийн материал, эх сурвалж, шалгасан огноог харна.')}</p>
          </div>
          <div>
            <strong>{t('2. Анкет, материал илгээх')}</strong>
            <p className="muted">{t('PDF, JPG, PNG файлаа хавсаргаад нэг дор илгээнэ. Дотоод лавлах дугаар олгоно.')}</p>
          </div>
          <div>
            <strong>{t('3. Архив, явц хянах')}</strong>
            <p className="muted">{t('Өмнөх мэдүүлэг, бүрдлийн үнэлгээгээ хэзээ ч нээж харна.')}</p>
          </div>
        </div>
        <p className="small muted mb0">{t('Систем виз олгох шийдвэр гаргахгүй. Албан ёсны хариуг Korea Visa Portal-аас шалгана.')}</p>
      </Card>
    </Page>
  );
}
