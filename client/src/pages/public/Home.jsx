import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, LinkButton, useAsync, ErrorBox, Skeleton } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';
import Icon from '../../components/Icon.jsx';

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
        <div className="hero-text">
          <span className="eyebrow">
            <Icon name="shield" size={16} />
            {t('Цахим виз')}
          </span>
          <h2>{t('Визийн мэдээлэл нэг дор')}</h2>
          <p>{t('Шаардлагаа уншиж, материалаа бүрдүүлээд мэдүүлгээ илгээнэ.')}</p>
          <div className="row-actions">
            <LinkButton to="/visas">
              {t('Визийн мэдээлэл үзэх')}
              <Icon name="arrow" size={18} />
            </LinkButton>
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
        <svg className="hero-art" viewBox="0 0 220 180" aria-hidden="true" focusable="false">
          <rect x="38" y="18" width="120" height="150" rx="14" className="ha-back" />
          <rect x="62" y="8" width="120" height="150" rx="14" className="ha-card" />
          <circle cx="122" cy="58" r="22" className="ha-accent" />
          <path d="M111 58l7 7 14-14" className="ha-check" />
          <rect x="82" y="96" width="80" height="8" rx="4" className="ha-line" />
          <rect x="82" y="114" width="60" height="8" rx="4" className="ha-line" />
          <rect x="82" y="132" width="70" height="8" rx="4" className="ha-line" />
          <circle cx="186" cy="150" r="18" className="ha-dot" />
        </svg>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={2} />
      ) : (
        <div className="grid grid-2">
          {cards.slice(0, Math.max(4, cards.length)).map((c, i) => (
            <Card key={c.id || `p${i}`} className={`country-card ${c.submittable ? '' : 'disabled'}`}>
              <div className="country-head">
                <span className="country-badge" aria-hidden>
                  {c.iso || <Icon name="flag" size={18} />}
                </span>
                <h3>{t(c.name) /* мэдэгдэж буй улсын нэрийг орчуулна (ж: БНСУ) */}</h3>
              </div>
              <div className="state">
                {c.placeholder ? t('Нэрийг баталгаажуулна') : c.submittable ? t('Үйлчилгээ нээлттэй') : t('Мэдүүлэг авахгүй байна')}
              </div>
              {c.submittable ? (
                <Link className="cta" to={`/visas?country=${c.iso}`}>
                  {t('Мэдээлэл үзэх →')}
                </Link>
              ) : (
                <span className="cta cta-off" aria-disabled>
                  {t('Тун удахгүй')}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
      <Card className="mt">
        <h2>{t('Энэ систем юу хийдэг вэ?')}</h2>
        <ol className="features">
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="book" size={22} />
            </span>
            <strong>{t('1. Мэдээлэл унших')}</strong>
            <p className="muted small">{t('Ангилал бүрийн материал, эх сурвалж, шалгасан огноог харна.')}</p>
          </li>
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="upload" size={22} />
            </span>
            <strong>{t('2. Анкет, материал илгээх')}</strong>
            <p className="muted small">{t('PDF, JPG, PNG файлаа хавсаргаад нэг дор илгээнэ. Дотоод лавлах дугаар олгоно.')}</p>
          </li>
          <li>
            <span className="feature-icon" aria-hidden>
              <Icon name="archive" size={22} />
            </span>
            <strong>{t('3. Архив, явц хянах')}</strong>
            <p className="muted small">{t('Өмнөх мэдүүлэг, бүрдлийн үнэлгээгээ хэзээ ч нээж харна.')}</p>
          </li>
        </ol>
        <p className="small muted mb0">{t('Систем виз олгох шийдвэр гаргахгүй. Албан ёсны хариуг Korea Visa Portal-аас шалгана.')}</p>
      </Card>
    </Page>
  );
}
