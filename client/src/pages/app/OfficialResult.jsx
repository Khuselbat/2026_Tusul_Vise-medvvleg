import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Button, Alert } from '../../components/ui.jsx';
import { resultNotice, ResultNotes, portalEnabled, usePortal } from '../../components/officialPortal.jsx';

// Зураг 50 / UC-06 Албан ёсны үр дүн шалгах — хувийн мэдээллийг URL-д дамжуулахгүй
import { t } from '../../i18n.js';
export default function OfficialResult() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/countries'), []);
  const portal = usePortal();
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
      <Alert tone="info">{resultNotice()}</Alert>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={2} />
      ) : (
        <div className="grid grid-2">
          {data?.countries.map((c) => {
            const enabled = portalEnabled(c);
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
                <Button variant={enabled ? 'primary' : 'ghost'} disabled={!enabled} onClick={() => portal.ask(c)}>
                  {t('Портал нээх ↗')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="mt">
        <h2>{t('Анхаарах')}</h2>
        <ResultNotes />
      </Card>
      {portal.dialog}
    </Page>
  );
}
