// Улс ба визийн ангиллын картууд — нүүр (нэвтэрсэн), /visas, зочны нэг хуудасны #visas хэсэг хуваалцана.
import { Link } from 'react-router-dom';
import { Card, Badge, fmtDate } from './ui.jsx';
import Icon from './Icon.jsx';
import { t } from '../i18n.js';

/** Дөрвөн улсын карт: баталгаажаагүй улсыг "Улс N" (тун удахгүй) гэж харуулна (тайлангийн 1-р бүлэг).
 *  `onSelect` өгвөл идэвхтэй улсын товч тухайн хуудсан дээр шүүлтүүр болгоно, үгүй бол /visas?country= руу. */
export function CountryCards({ countries, onSelect, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
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
    <div className="grid grid-2">
      {cards.map((c, i) => (
        <Card key={c.id || `p${i}`} className={`country-card ${c.submittable ? '' : 'disabled'}`}>
          <div className="country-head">
            <span className="country-badge" aria-hidden>
              {c.iso || <Icon name="flag" size={18} />}
            </span>
            <H>{t(c.name) /* мэдэгдэж буй улсын нэрийг орчуулна (ж: БНСУ) */}</H>
          </div>
          <div className="state">
            {c.placeholder ? t('Нэрийг баталгаажуулна') : c.submittable ? t('Үйлчилгээ нээлттэй') : t('Мэдүүлэг авахгүй байна')}
          </div>
          {c.submittable ? (
            onSelect ? (
              <button type="button" className="cta cta-btn" onClick={() => onSelect(c.iso)}>
                {t('Мэдээлэл үзэх →')}
              </button>
            ) : (
              <Link className="cta" to={`/visas?country=${c.iso}`}>
                {t('Мэдээлэл үзэх →')}
              </Link>
            )
          ) : (
            <span className="cta cta-off" aria-disabled>
              {t('Тун удахгүй')}
            </span>
          )}
        </Card>
      ))}
    </div>
  );
}

/** Нийтэлсэн визийн ангиллын карт → /visas/:versionId */
export function VisaCard({ v, headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  return (
    <Link to={`/visas/${v.versionId}`} className="card visa-card">
      <div className="between">
        <span className="code">
          {v.country.name} · {v.code}
        </span>
        {v.canApply ? <Badge tone="ok">{t('Мэдүүлэг авна')}</Badge> : <Badge tone="muted">{t('Зөвхөн мэдээлэл')}</Badge>}
      </div>
      <H>{v.name}</H>
      <p className="muted small mb0 clamp-2">{v.description}</p>
      <div className="kv-inline">
        <span>
          {t('Материал:')} {v.requirementCount}
        </span>
        <span>
          {t('Шалгасан:')} {fmtDate(v.verifiedAt)}
        </span>
        <span>
          {t('Хувилбар v')}
          {v.versionNo}
        </span>
      </div>
    </Link>
  );
}
