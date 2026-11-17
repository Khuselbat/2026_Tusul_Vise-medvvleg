import { useState } from 'react';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Button, Confirm, Alert } from '../../components/ui.jsx';

// Зураг 50 / UC-06 Албан ёсны үр дүн шалгах — хувийн мэдээллийг URL-д дамжуулахгүй
import { t } from '../../i18n.js';
export default function OfficialResult() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/countries'), []);
  const [target, setTarget] = useState(null);
  const go = () => {
    window.open(target.officialResultUrl, '_blank', 'noopener,noreferrer');
    setTarget(null);
  };
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Үр дүн шалгах'),
        },
      ]}
      title={t('Албан ёсны үр дүн шалгах')}
      subtitle={t('Визийн шийдвэрийг эрх бүхий байгууллага гаргана; хариуг албан ёсны порталаас шалгана')}
    >
      <Alert tone="info">
        {t(
          'Энэ систем визийн шийдвэрийг татаж харуулахгүй. Порталд мэдүүлгийн төрлөө сонгоод, паспорт/хүлээн авсан дугаар, англи нэр, төрсөн огноогоо паспорт дээрх бичлэгтэй ижил оруулна. Дотоод лавлах дугаар (KR-…) нь албан ёсны дугаар биш.',
        )}
      </Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={2} />
      ) : (
        <div className="grid grid-2">
          {data?.countries.map((c) => {
            const enabled = c.status === 'ACTIVE' && !!c.officialResultUrl;
            return (
              <Card key={c.id}>
                <h2>{c.name}</h2>
                {enabled ? (
                  <p className="small muted">
                    {new URL(c.officialResultUrl).hostname} {t('— албан ёсны хариу шалгах хуудас')}
                  </p>
                ) : (
                  <p className="small muted">
                    {c.status !== 'ACTIVE' ? t('Энэ улсын үйлчилгээ идэвхгүй.') : t('Портал холбоос тохируулаагүй.')}
                  </p>
                )}
                <Button variant={enabled ? 'primary' : 'ghost'} disabled={!enabled} onClick={() => setTarget(c)}>
                  {t('Портал нээх ↗')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="mt">
        <h2>{t('Анхаарах')}</h2>
        <ul
          className="small"
          style={{
            paddingLeft: 18,
            margin: 0,
          }}
        >
          <li>{t('Үр дүн олдоогүй бол татгалзсан гэж бүү дүгнэ — оруулсан мэдээлэл, бүртгэлээ нягтална уу.')}</li>
          <li>{t('Порталын нууц үгээ энэ системд хэзээ ч оруулахгүй.')}</li>
          <li>{t('Виз гарсан ба паспорт авахад бэлэн болсон нь тусдаа ойлголт.')}</li>
        </ul>
      </Card>
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
    </Page>
  );
}
