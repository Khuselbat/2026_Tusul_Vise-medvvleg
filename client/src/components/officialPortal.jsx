// Албан ёсны хариу шалгах порталын нийтлэг хэсэг — /app/official-result (мэдүүлэгч) ба зочны нэг хуудасны #check.
// Систем визийн шийдвэрийг татаж/зохиож харуулахгүй (BR-09); порталыг Confirm-оор шинэ цонхонд нээнэ, мэдээлэл дамжуулахгүй.
import { useState } from 'react';
import { Confirm } from './ui.jsx';
import { t } from '../i18n.js';

export const resultNotice = () =>
  t(
    'Энэ систем визийн шийдвэрийг татаж харуулахгүй. Порталд мэдүүлгийн төрлөө сонгоод, паспорт/хүлээн авсан дугаар, англи нэр, төрсөн огноогоо паспорт дээрх бичлэгтэй ижил оруулна. Дотоод лавлах дугаар (KR-…) нь албан ёсны дугаар биш.',
  );

/** Анхааруулах 3 зүйл */
export function ResultNotes({ className = 'small' }) {
  return (
    <ul className={`notes ${className}`}>
      <li>{t('Үр дүн олдоогүй бол татгалзсан гэж бүү дүгнэ — оруулсан мэдээлэл, бүртгэлээ нягтална уу.')}</li>
      <li>{t('Порталын нууц үгээ энэ системд хэзээ ч оруулахгүй.')}</li>
      <li>{t('Виз гарсан ба паспорт авахад бэлэн болсон нь тусдаа ойлголт.')}</li>
    </ul>
  );
}

export const portalEnabled = (c) => c?.status === 'ACTIVE' && !!c.officialResultUrl;

/** Порталыг Confirm-оор нээх: `const portal = usePortal(); portal.ask(country)`; `{portal.dialog}`-ийг render хийнэ */
export function usePortal() {
  const [target, setTarget] = useState(null);
  const go = () => {
    window.open(target.officialResultUrl, '_blank', 'noopener,noreferrer');
    setTarget(null);
  };
  const dialog = (
    <Confirm
      open={!!target}
      title={t('Гадаад сайт руу шилжих')}
      confirmLabel={t('Үргэлжлүүлэх')}
      onClose={() => setTarget(null)}
      onConfirm={go}
    >
      {t('Та')} <strong>{target && new URL(target.officialResultUrl).hostname}</strong>{' '}
      {t(
        'сайтыг шинэ цонхонд нээх гэж байна. Энэ нь манай системээс гадуурх албан ёсны сайт бөгөөд таны мэдээллийг автоматаар дамжуулахгүй.',
      )}
    </Confirm>
  );
  return { ask: setTarget, dialog };
}
