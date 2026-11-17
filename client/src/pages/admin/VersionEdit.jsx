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
export default function VersionEdit() {
  const { id: typeId, versionId } = useParams();
  const isNew = !versionId;
  const navigate = useNavigate();
  const toast = useToast();
  const loaded = useAsync(() => (isNew ? Promise.resolve(null) : api.get(`/api/admin/versions/${versionId}`)), [versionId]);
  const [f, setF] = useState({ nameMn: '', description: '', sourceUrl: '', verifiedAt: '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const v = loaded.data?.version;
  const published = !!v?.publishedAt;

  useEffect(() => {
    if (v) setF({ nameMn: v.nameMn || '', description: v.description || '', sourceUrl: v.sourceUrl || '', verifiedAt: v.verifiedAt || '' });
  }, [v]);

  function check(forPublish) {
    const fe = {};
    if (f.nameMn.trim().length < 2) fe.nameMn = 'Нэр оруулна уу.';
    if (f.sourceUrl && !f.sourceUrl.startsWith('https://')) fe.sourceUrl = 'Зөвхөн HTTPS холбоос.';
    if (forPublish && !f.sourceUrl) fe.sourceUrl = 'Нийтлэхэд эх сурвалж заавал.';
    if (forPublish && !f.verifiedAt) fe.verifiedAt = 'Нийтлэхэд шалгасан огноо заавал.';
    setErrs(fe);
    return !Object.keys(fe).length;
  }

  async function saveDraft() {
    if (!check(false)) return;
    setBusy(true);
    try {
      if (isNew) {
        const r = await api.post(`/api/admin/visa-types/${typeId}/versions`, f);
        toast(`v${r.versionNo} ноорог хадгалагдлаа.`);
        navigate(`/admin/versions/${r.id}/requirements`, { replace: true });
      } else {
        await api.put(`/api/admin/versions/${versionId}`, f);
        toast('Ноорог хадгалагдлаа.');
        loaded.reload();
      }
    } catch (ex) {
      setErrs({ ...ex.fields, _: ex.message });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      await api.put(`/api/admin/versions/${versionId}`, f);
      await api.post(`/api/admin/versions/${versionId}/publish`);
      toast('Нийтлэгдлээ.');
      setPubOpen(false);
      loaded.reload();
    } catch (ex) {
      setPubOpen(false);
      setErrs({ ...ex.fields, _: ex.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/admin/versions/${versionId}`);
      toast('Ноорог устгагдлаа.', 'info');
      navigate(`/admin/visa-types/${v.visaTypeId}/versions`);
    } catch (ex) {
      setDelOpen(false);
      setErrs({ _: ex.message });
    } finally {
      setBusy(false);
    }
  }

  async function copyNew() {
    setBusy(true);
    try {
      const r = await api.post(`/api/admin/visa-types/${v.visaTypeId}/versions`, { copyFromVersionId: v.id });
      toast(`v${r.versionNo} ноорог үүслээ.`);
      navigate(`/admin/versions/${r.id}`);
    } catch (ex) {
      setErrs({ _: ex.message });
    } finally {
      setBusy(false);
    }
  }

  const backType = isNew ? typeId : v?.visaTypeId;
  return (
    <Page
      crumb={[
        { label: 'Админ', to: '/admin' },
        { label: 'Визийн төрөл', to: '/admin/visa-types' },
        { label: 'Хувилбарууд', to: backType ? `/admin/visa-types/${backType}/versions` : undefined },
        { label: isNew ? 'Шинэ' : `v${v?.versionNo || ''}` },
      ]}
      title={isNew ? 'Шинэ мэдээллийн хувилбар' : 'Визийн мэдээллийн хувилбар'}
      subtitle={v && `${v.countryName} · ${v.typeCode} · v${v.versionNo}`}
    >
      <ErrorBox error={loaded.error} onRetry={loaded.reload} />
      {loaded.loading ? (
        <Skeleton rows={4} />
      ) : (
        <>
          {published && (
            <Alert tone="info">
              Энэ хувилбар {fmtDateTime(v.publishedAt)}-нд нийтлэгдсэн тул зөвхөн уншина. Өөрчлөхийн тулд хуулж шинэ хувилбар үүсгэнэ үү.
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
              <Field label="Нэр (монгол)" htmlFor="n" error={errs.nameMn} required className="span-2">
                <input id="n" value={f.nameMn} disabled={published} onChange={(e) => setF({ ...f, nameMn: e.target.value })} />
              </Field>
              <Field label="Тайлбар" htmlFor="d" className="span-2">
                <textarea
                  id="d"
                  rows={6}
                  value={f.description}
                  disabled={published}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                />
              </Field>
              <Field label="Эх сурвалжийн URL" htmlFor="s" error={errs.sourceUrl} hint="Нийтлэхэд заавал (BR-04)">
                <input
                  id="s"
                  value={f.sourceUrl}
                  disabled={published}
                  placeholder="https://"
                  onChange={(e) => setF({ ...f, sourceUrl: e.target.value })}
                />
              </Field>
              <Field label="Шалгасан огноо" htmlFor="va" error={errs.verifiedAt} hint="Нийтлэхэд заавал">
                <input
                  id="va"
                  type="date"
                  value={f.verifiedAt}
                  disabled={published}
                  onChange={(e) => setF({ ...f, verifiedAt: e.target.value })}
                />
              </Field>
            </div>
            {v && (
              <p className="small muted mt mb0">
                Үүсгэсэн: {v.createdBy} · {fmtDateTime(v.createdAt)} ·{' '}
                {published ? <Badge tone="ok">Нийтэлсэн</Badge> : <Badge tone="muted">Ноорог</Badge>}
              </p>
            )}
          </Card>
          <div className="page-footer">
            {!published && (
              <Button loading={busy} onClick={saveDraft}>
                Ноорог хадгалах
              </Button>
            )}
            {!isNew && (
              <Link className="btn btn-ghost" to={`/admin/versions/${versionId}/requirements`}>
                Шаардлага {published ? 'үзэх' : 'засах'} ({loaded.data?.requirements.length ?? 0})
              </Link>
            )}
            {!isNew && !published && (
              <Button variant="ghost" onClick={() => check(true) && setPubOpen(true)}>
                Нийтлэх
              </Button>
            )}
            {published && (
              <Button variant="ghost" loading={busy} onClick={copyNew}>
                Хуулж шинэ хувилбар үүсгэх
              </Button>
            )}
            {!isNew && !published && (
              <Button variant="ghost" className="btn-link danger" onClick={() => setDelOpen(true)}>
                Ноорог устгах
              </Button>
            )}
          </div>
        </>
      )}
      <Confirm
        open={pubOpen}
        title="Хувилбарыг нийтлэх үү?"
        confirmLabel="Нийтлэх"
        loading={busy}
        onClose={() => setPubOpen(false)}
        onConfirm={publish}
      >
        Нийтэлсний дараа зочин, мэдүүлэгчид харагдаж, шинэ мэдүүлэг энэ хувилбараар үүснэ. Нийтэлсэн хувилбарыг засах боломжгүй. Өмнө
        илгээсэн мэдүүлгүүд хуучин хувилбартайгаа холбоотой үлдэнэ.
      </Confirm>
      <Confirm
        open={delOpen}
        title="Ноорог устгах уу?"
        tone="danger"
        confirmLabel="Устгах"
        loading={busy}
        onClose={() => setDelOpen(false)}
        onConfirm={remove}
      >
        Энэ ноорог болон түүний шаардлагууд устана.
      </Confirm>
    </Page>
  );
}
