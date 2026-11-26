import { Link } from 'react-router-dom';
import { Page, Card } from '../../components/ui.jsx';
import { t } from '../../i18n.js';

// "Мэдээллийн заавар"-ын хэсгүүд — нэвтэрсэн хэрэглэгчийн /help хуудас ба зочны нэг хуудас (#how, #security, #contact) хуваалцана.
// `visasLink` — зочны нэг хуудсанд "/#visas" (хуудсан дотор), бусад үед "/visas".
export function HelpSteps({ visasLink = '/visas', level = 2 }) {
  const H = `h${level}`;
  return (
    <>
      <H>{t('Мэдүүлэг илгээх алхам')}</H>
      <ol>
        <li>
          {visasLink.startsWith('#') ? <a href={visasLink}>{t('Визийн мэдээлэл')}</a> : <Link to={visasLink}>{t('Визийн мэдээлэл')}</Link>}{' '}
          {t('хэсгээс ангиллаа сонгож материалын жагсаалтыг уншина.')}
        </li>
        <li>{t('Бүртгүүлж нэвтэрнэ.')}</li>
        <li>{t('Анкетаа паспорт дээрх латин бичлэгээр бөглөнө.')}</li>
        <li>{t('Материал бүрийг PDF, JPG, PNG хэлбэрээр хавсаргана (файл ≤10 MB, нийт ≤100 MB).')}</li>
        <li>{t('Мэдээллээ хянаад илгээнэ. Дотоод лавлах дугаар олгоно.')}</li>
      </ol>
    </>
  );
}

export function HelpNotes({ level = 2 }) {
  const H = `h${level}`;
  return (
    <>
      <H>{t('Чухал тэмдэглэл')}</H>
      <ul>
        <li>{t('“Цахимаар мэдүүлэх” нь операторт хүсэлт илгээх гэсэн үг; ЭСЯ-ны системд шууд бүртгэгдэхгүй.')}</li>
        <li>{t('Дотоод лавлах дугаар нь албан ёсны визийн дугаар биш.')}</li>
        <li>{t('Операторын “Бүрдэл бүрэн / дутуу” үнэлгээ нь виз олгох шийдвэр биш.')}</li>
        <li>{t('Албан ёсны хариуг Korea Visa Portal-аас шалгана. Портал дээр хариу олдохгүй бол татгалзсан гэж бүү дүгнэ.')}</li>
        <li>{t('Паспортын эх хувийг материал хүлээлгэн өгөхдөө авч очно.')}</li>
      </ul>
    </>
  );
}

export function HelpContacts({ level = 2 }) {
  const H = `h${level}`;
  return (
    <>
      <H>{t('Холбоо барих (албан ёсны эх сурвалж)')}</H>
      <ul>
        <li>{t('БНСУ-ын ЭСЯ — визийн утас: +976 7007-1030')}</li>
        <li>
          {t('Монгол дахь KVAC —')}{' '}
          <a href="https://www.visaforkorea.mn" target="_blank" rel="noopener noreferrer">
            visaforkorea.mn
          </a>
        </li>
        <li>
          Korea Visa Portal —{' '}
          <a href="https://www.visa.go.kr" target="_blank" rel="noopener noreferrer">
            visa.go.kr
          </a>
        </li>
      </ul>
      <p className="small muted">{t('Эх сурвалжийг 2026-10-30-нд шалгасан. Мэдүүлэг өгөхийн өмнө дахин нягтална уу.')}</p>
    </>
  );
}

export function HelpPrivacy({ level = 2 }) {
  const H = `h${level}`;
  return (
    <>
      <H>{t('Хувийн мэдээлэл')}</H>
      <p>
        {t(
          'Паспортын дугаарыг сервер дээр шифрлэж хадгална. Хавсралтыг зөвхөн та болон хуваарилагдсан оператор нээнэ; админ эрх таны файлыг үзэх эрх биш. Порталын нууц үгийг энэ системд хэзээ ч оруулахгүй.',
        )}
      </p>
    </>
  );
}

export default function Help() {
  return (
    <Page
      crumb={[
        {
          label: t('Тусламж'),
        },
      ]}
      title={t('Мэдээллийн заавар')}
      subtitle={t('Системийг хэрхэн ашиглах, юуг хариуцдаг вэ')}
    >
      <div className="grid grid-2">
        <Card className="prose">
          <HelpSteps />
        </Card>
        <Card className="prose">
          <HelpNotes />
        </Card>
        <Card className="prose">
          <HelpContacts />
        </Card>
        <Card className="prose">
          <HelpPrivacy />
        </Card>
      </div>
    </Page>
  );
}
