import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, LinkButton, useAsync, ErrorBox, Skeleton } from '../../components/ui.jsx';
import { useAuth, HOME_BY_ROLE } from '../../auth.jsx';

// Зураг 37 Нүүр хуудас — дөрвөн улсын карт; зөвхөн идэвхтэй улсын үйлчилгээг сонгоно
export default function Home() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => api.get('/api/countries'), []);
  const countries = data?.countries || [];
  // Бусад улсын нэр баталгаажаагүй бол "Улс N" гэсэн хаалттай карт харуулна (тайлангийн 1-р бүлэг)
  const cards = [...countries];
  for (let i = cards.length; i < 4; i += 1) cards.push({ placeholder: true, name: `Улс ${i + 1}`, status: 'COMING_SOON' });

  return (
    <Page crumb={[{ label: user ? 'Нүүр' : 'Зочин' }]} title="Нүүр хуудас" subtitle="Визийн мэдээлэл, мэдүүлэг, архивыг нэг дор">
      <div className="hero">
        <h2>Визийн мэдээлэл нэг дор</h2>
        <p>Шаардлагаа уншиж, материалаа бүрдүүлээд мэдүүлгээ илгээнэ.</p>
        <div className="row-actions">
          <LinkButton to="/visas">Визийн мэдээлэл үзэх</LinkButton>
          {user ? (
            <LinkButton variant="ghost" to={HOME_BY_ROLE[user.role]}>
              Миний самбар
            </LinkButton>
          ) : (
            <LinkButton variant="ghost" to="/register">
              Бүртгүүлэх
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
              <h3>{c.name}</h3>
              <div className="state">
                {c.placeholder ? 'Нэрийг баталгаажуулна' : c.submittable ? 'Үйлчилгээ нээлттэй' : 'Мэдүүлэг авахгүй байна'}
              </div>
              {c.submittable ? (
                <Link className="cta" to={`/visas?country=${c.iso}`}>
                  Мэдээлэл үзэх →
                </Link>
              ) : (
                <span className="cta" style={{ color: 'var(--muted)' }} aria-disabled>
                  Тун удахгүй
                </span>
              )}
            </Card>
          ))}
        </div>
      )}
      <Card className="mt">
        <h2>Энэ систем юу хийдэг вэ?</h2>
        <div className="grid grid-3 small">
          <div>
            <strong>1. Мэдээлэл унших</strong>
            <p className="muted">Ангилал бүрийн материал, эх сурвалж, шалгасан огноог харна.</p>
          </div>
          <div>
            <strong>2. Анкет, материал илгээх</strong>
            <p className="muted">PDF, JPG, PNG файлаа хавсаргаад нэг дор илгээнэ. Дотоод лавлах дугаар олгоно.</p>
          </div>
          <div>
            <strong>3. Архив, явц хянах</strong>
            <p className="muted">Өмнөх мэдүүлэг, бүрдлийн үнэлгээгээ хэзээ ч нээж харна.</p>
          </div>
        </div>
        <p className="small muted mb0">Систем виз олгох шийдвэр гаргахгүй. Албан ёсны хариуг Korea Visa Portal-аас шалгана.</p>
      </Card>
    </Page>
  );
}
