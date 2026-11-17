import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  Card,
  Field,
  Button,
  Alert,
  ErrorBox,
  Skeleton,
  Confirm,
  useAsync,
  useToast,
  Badge,
  fmtDateTime,
} from '../../components/ui.jsx';

// Зураг 57 Визийн мэдээллийн хувилбар засах. Нийтэлсэн хувилбарыг шууд засахгүй.
import { t } from '../../i18n.js';
export default function VersionEdit() {
  const { id: typeId, versionId } = useParams();
  const isNew = !versionId;
  const navigate = useNavigate();
  const toast = useToast();
  const loaded = useAsync(() => (isNew ? Promise.resolve(null) : api.get(`/api/admin/versions/${versionId}`)), [versionId]);
  const [f, setF] = useState({
    nameMn: '',
    description: '',
    sourceUrl: '',
    verifiedAt: '',
  });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const v = loaded.data?.version;
  const published = !!v?.publishedAt;
  useEffect(() => {
    if (v)
      setF({
        nameMn: v.nameMn || '',
        description: v.description || '',
        sourceUrl: v.sourceUrl || '',
        verifiedAt: v.verifiedAt || '',
      });
  }, [v]);
  function check(forPublish) {
    const fe = {};
    if (f.nameMn.trim().length < 2) fe.nameMn = t('Нэр оруулна уу.');
    if (f.sourceUrl && !f.sourceUrl.startsWith('https://')) fe.sourceUrl = t('Зөвхөн HTTPS холбоос.');
    if (forPublish && !f.sourceUrl) fe.sourceUrl = t('Нийтлэхэд эх сурвалж заавал.');
    if (forPublish && !f.verifiedAt) fe.verifiedAt = t('Нийтлэхэд шалгасан огноо заавал.');
    setErrs(fe);
    return !Object.keys(fe).length;
  }
  async function saveDraft() {
    if (!check(false)) return;
    setBusy(true);
    try {
      if (isNew) {
        const r = await api.post(`/api/admin/visa-types/${typeId}/versions`, f);
        toast(
          t('v{{v0}} ноорог хадгалагдлаа.', {
            v0: r.versionNo,
          }),
        );
        navigate(`/admin/versions/${r.id}/requirements`, {
          replace: true,
        });
      } else {
        await api.put(`/api/admin/versions/${versionId}`, f);
        toast(t('Ноорог хадгалагдлаа.'));
        loaded.reload();
      }
    } catch (ex) {
      setErrs({
        ...ex.fields,
        _: ex.message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      await api.put(`/api/admin/versions/${versionId}`, f);
      await api.post(`/api/admin/versions/${versionId}/publish`);
      toast(t('Нийтлэгдлээ.'));
      setPubOpen(false);
      loaded.reload();
    } catch (ex) {
      setPubOpen(false);
      setErrs({
        ...ex.fields,
        _: ex.message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/admin/versions/${versionId}`);
      toast(t('Ноорог устгагдлаа.'), 'info');
      navigate(`/admin/visa-types/${v.visaTypeId}/versions`);
    } catch (ex) {
      setDelOpen(false);
      setErrs({
        _: ex.message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function copyNew() {
    setBusy(true);
    try {
      const r = await api.post(`/api/admin/visa-types/${v.visaTypeId}/versions`, {
        copyFromVersionId: v.id,
      });
      toast(
        t('v{{v0}} ноорог үүслээ.', {
          v0: r.versionNo,
        }),
      );
      navigate(`/admin/versions/${r.id}`);
    } catch (ex) {
      setErrs({
        _: ex.message,
      });
    } finally {
      setBusy(false);
    }
  }
  const backType = isNew ? typeId : v?.visaTypeId;
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Визийн төрөл'),
          to: '/admin/visa-types',
        },
        {
          label: t('Хувилбарууд'),
          to: backType ? `/admin/visa-types/${backType}/versions` : undefined,
        },
        {
          label: isNew ? t('Шинэ') : `v${v?.versionNo || ''}`,
        },
      ]}
      title={isNew ? t('Шинэ мэдээллийн хувилбар') : t('Визийн мэдээллийн хувилбар')}
      subtitle={v && `${v.countryName} · ${v.typeCode} · v${v.versionNo}`}
    >
      <ErrorBox error={loaded.error} onRetry={loaded.reload} />
      {loaded.loading ? (
        <Skeleton rows={4} />
      ) : (
        <>
          {published && (
            <Alert tone="info">
              {t('Энэ хувилбар')} {fmtDateTime(v.publishedAt)}
              {t('-нд нийтлэгдсэн тул зөвхөн уншина. Өөрчлөхийн тулд хуулж шинэ хувилбар үүсгэнэ үү.')}
            </Alert>
          )}
          {errs._ && (
            <Alert tone="danger">
              {errs._}
              {errs.requirements && (
                <>
                  {' '}
                  — <Link to={`/admin/versions/${versionId}/requirements`}>{errs.requirements}</Link>
                </>
              )}
            </Alert>
          )}
          <Card>
            <div className="form-grid">
              <Field label={t('Нэр (монгол)')} htmlFor="n" error={errs.nameMn} required className="span-2">
                <input
                  id="n"
                  value={f.nameMn}
                  disabled={published}
                  onChange={(e) =>
                    setF({
                      ...f,
                      nameMn: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label={t('Тайлбар')} htmlFor="d" className="span-2">
                <textarea
                  id="d"
                  rows={6}
                  value={f.description}
                  disabled={published}
                  onChange={(e) =>
                    setF({
                      ...f,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label={t('Эх сурвалжийн URL')} htmlFor="s" error={errs.sourceUrl} hint={t('Нийтлэхэд заавал (BR-04)')}>
                <input
                  id="s"
                  value={f.sourceUrl}
                  disabled={published}
                  placeholder="https://"
                  onChange={(e) =>
                    setF({
                      ...f,
                      sourceUrl: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label={t('Шалгасан огноо')} htmlFor="va" error={errs.verifiedAt} hint={t('Нийтлэхэд заавал')}>
                <input
                  id="va"
                  type="date"
                  value={f.verifiedAt}
                  disabled={published}
                  onChange={(e) =>
                    setF({
                      ...f,
                      verifiedAt: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            {v && (
              <p className="small muted mt mb0">
                {t('Үүсгэсэн:')} {v.createdBy} · {fmtDateTime(v.createdAt)} ·
                {v.verifiedBy
                  ? t(' Шалгасан ажилтан: {{v0}} ·', {
                      v0: v.verifiedBy,
                    })
                  : ''}{' '}
                {published ? <Badge tone="ok">{t('Нийтэлсэн')}</Badge> : <Badge tone="muted">{t('Ноорог')}</Badge>}
              </p>
            )}
          </Card>
          <div className="page-footer">
            {!published && (
              <Button loading={busy} onClick={saveDraft}>
                {t('Ноорог хадгалах')}
              </Button>
            )}
            {!isNew && (
              <Link className="btn btn-ghost" to={`/admin/versions/${versionId}/requirements`}>
                {t('Шаардлага')} {published ? t('үзэх') : t('засах')} ({loaded.data?.requirements.length ?? 0})
              </Link>
            )}
            {!isNew && !published && (
              <Button variant="ghost" onClick={() => check(true) && setPubOpen(true)}>
                {t('Нийтлэх')}
              </Button>
            )}
            {published && (
              <Button variant="ghost" loading={busy} onClick={copyNew}>
                {t('Хуулж шинэ хувилбар үүсгэх')}
              </Button>
            )}
            {!isNew && !published && (
              <Button variant="ghost" className="btn-link danger" onClick={() => setDelOpen(true)}>
                {t('Ноорог устгах')}
              </Button>
            )}
          </div>
        </>
      )}
      <Confirm
        open={pubOpen}
        title={t('Хувилбарыг нийтлэх үү?')}
        confirmLabel={t('Нийтлэх')}
        loading={busy}
        onClose={() => setPubOpen(false)}
        onConfirm={publish}
      >
        {t(
          'Нийтэлсний дараа зочин, мэдүүлэгчид харагдаж, шинэ мэдүүлэг энэ хувилбараар үүснэ. Нийтэлсэн хувилбарыг засах боломжгүй. Өмнө илгээсэн мэдүүлгүүд хуучин хувилбартайгаа холбоотой үлдэнэ.',
        )}
      </Confirm>
      <Confirm
        open={delOpen}
        title={t('Ноорог устгах уу?')}
        tone="danger"
        confirmLabel={t('Устгах')}
        loading={busy}
        onClose={() => setDelOpen(false)}
        onConfirm={remove}
      >
        {t('Энэ ноорог болон түүний шаардлагууд устана.')}
      </Confirm>
    </Page>
  );
}
