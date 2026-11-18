// Админ: имэйлийн (SMTP) тохиргоо зөв эсэхийг шалгах — өөрийн хаяг руу туршилтын захидал.
import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Button, Card, useAsync } from './ui.jsx';
import { t } from '../i18n.js';

const TRANSPORT_LABEL = {
  smtp: () => t('SMTP — жинхэнэ имэйл илгээнэ'),
  ethereal: () => t('Ethereal — туршилтын сервер (жинхэнэ хаяг руу явахгүй)'),
  file: () => t('Файл — server/mail-outbox (жинхэнэ хаяг руу явахгүй)'),
  console: () => t('Консол — зөвхөн серверийн терминалд (жинхэнэ хаяг руу явахгүй)'),
  memory: () => t('Санах ой (тест)'),
  log: () => t('Лог (жинхэнэ хаяг руу явахгүй)'),
};

export default function MailCheck() {
  const { data: s, reload } = useAsync(() => api.get('/api/admin/mail/status'), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  async function sendTest() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post('/api/admin/mail/test');
      setResult({ ok: true, ...r });
    } catch (ex) {
      setResult({ ok: false, message: ex.message, code: ex.code });
    } finally {
      setBusy(false);
      reload();
    }
  }
  return (
    <Card>
      <h2>{t('Имэйл (SMTP)')}</h2>
      {s && (
        <dl className="kv small">
          <dt>{t('Горим')}</dt>
          <dd>{(TRANSPORT_LABEL[s.transport] || (() => s.transport))()}</dd>
          {s.transport === 'smtp' && (
            <>
              <dt>{t('Сервер')}</dt>
              <dd>{s.host ? `${s.host}:${s.port}${s.secure ? ' (TLS)' : ''}` : t('тохируулаагүй')}</dd>
              <dt>{t('Нэвтрэх нэр / нууц үг')}</dt>
              <dd>
                {s.user || t('байхгүй')} · {s.passwordSet ? t('нууц үг тохируулсан') : t('нууц үг тохируулаагүй')}
              </dd>
            </>
          )}
          <dt>{t('Илгээгч')}</dt>
          <dd>{s.from}</dd>
          <dt>{t('Холбоосын үндэс')}</dt>
          <dd>{s.appUrl || t('тохируулаагүй')}</dd>
        </dl>
      )}
      {s && !s.delivers && (
        <Alert tone="warn">{t('Имэйл жинхэнэ хаяг руу явахгүй горимд байна. .env-д SMTP_* тохируулаад серверээ дахин асаана уу.')}</Alert>
      )}
      {result?.ok && (
        <Alert tone="ok">
          {t('Туршилтын имэйл {{v0}} хаяг руу илгээгдлээ.', { v0: result.to })}
          {result.previewUrl && (
            <>
              {' '}
              <a href={result.previewUrl} target="_blank" rel="noreferrer noopener">
                {t('Ethereal дээр харах')}
              </a>
            </>
          )}
        </Alert>
      )}
      {result && !result.ok && <Alert tone="danger">{result.message}</Alert>}
      <Button variant="ghost" loading={busy} onClick={sendTest}>
        {t('Туршилтын имэйл илгээх')}
      </Button>
    </Card>
  );
}
