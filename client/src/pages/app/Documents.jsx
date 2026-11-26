// Бичиг баримтын сан — мэдүүлэгт давтан ашиглагдах баримтыг (паспортын хуулбар, цээж зураг, тодорхойлолт, хуулга г.м.)
// нэг удаа хадгална. Шинэ мэдүүлгийн шаардлагад тохирох баримт автоматаар ХУУЛАГДАЖ хавсрагдана.
import { useRef, useState } from 'react';
import { api } from '../../api.js';
import {
  Page,
  Card,
  Field,
  Button,
  Badge,
  Alert,
  Empty,
  ErrorBox,
  Skeleton,
  Confirm,
  Modal,
  useAsync,
  useToast,
  fmtBytes,
  fmtDate,
  TableWrap,
} from '../../components/ui.jsx';
import { FileViewer, ScanBadge, usePendingScanPoll } from '../../components/shared.jsx';
import { ExpiryWarnings } from '../../components/PersonalInfoCard.jsx';
import { t } from '../../i18n.js';

const EXPIRY_BADGE = {
  EXPIRED: ['danger', () => t('Хугацаа дууссан')],
  EXPIRING: ['warn', () => t('Хугацаа дуусах гэж байна')],
  VALID: ['ok', () => t('Хүчинтэй')],
};

const asFile = (d) => ({ ...d, url: `/api/files/profile/${d.id}` });

function MetaFields({ meta, setMeta, types, errors, idPrefix }) {
  const type = types.find((x) => x.code === meta.typeCode);
  return (
    <>
      <Field label={t('Баримтын төрөл')} htmlFor={`${idPrefix}-type`} error={errors.typeCode} required>
        <select id={`${idPrefix}-type`} value={meta.typeCode} onChange={(e) => setMeta({ ...meta, typeCode: e.target.value })}>
          <option value="">{t('— сонгох —')}</option>
          {types.map((x) => (
            <option key={x.code} value={x.code}>
              {t(x.name)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('Тайлбар (заавал биш)')} htmlFor={`${idPrefix}-title`} error={errors.title}>
        <input id={`${idPrefix}-title`} value={meta.title} maxLength={200} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
      </Field>
      <div className="grid grid-2">
        <Field label={t('Олгосон огноо')} htmlFor={`${idPrefix}-issued`} error={errors.issuedOn}>
          <input
            id={`${idPrefix}-issued`}
            type="date"
            value={meta.issuedOn}
            onChange={(e) => setMeta({ ...meta, issuedOn: e.target.value })}
          />
        </Field>
        <Field
          label={t('Хүчинтэй хугацаа (хүртэл)')}
          htmlFor={`${idPrefix}-valid`}
          error={errors.validUntil}
          hint={type?.hasExpiry ? t('Баримт дээр заасан хугацааг оруулна — дуусахаас өмнө анхааруулна.') : undefined}
        >
          <input
            id={`${idPrefix}-valid`}
            type="date"
            value={meta.validUntil}
            onChange={(e) => setMeta({ ...meta, validUntil: e.target.value })}
          />
        </Field>
      </div>
    </>
  );
}

const EMPTY_META = { typeCode: '', title: '', issuedOn: '', validUntil: '' };

export default function Documents() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/app/profile'), []);
  usePendingScanPoll(data?.documents, reload);
  const toast = useToast();
  const fileRef = useRef(null);
  const [meta, setMeta] = useState(EMPTY_META);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const fe = {};
    if (!meta.typeCode) fe.typeCode = t('Баримтын төрлөө сонгоно уу.');
    if (!file) fe.file = t('Файл сонгоно уу.');
    else if (file.size > 10 * 1024 * 1024) fe.file = t('Файлын хэмжээ 10 MB-аас их байна.');
    setErrors(fe);
    if (Object.keys(fe).length) return;
    const form = new FormData();
    for (const [k, v] of Object.entries(meta)) form.append(k, v);
    form.append('file', file);
    setBusy(true);
    try {
      await api.upload('/api/app/profile/documents', form);
      toast(t('Баримт хадгалагдлаа.'));
      setMeta(EMPTY_META);
      fileRef.current.value = '';
      reload();
    } catch (ex) {
      setErrors({ ...(ex.fields || {}), file: ex.fields ? undefined : ex.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    try {
      await api.put(`/api/app/profile/documents/${editing.id}`, editing.meta);
      setEditing(null);
      reload();
    } catch (ex) {
      setEditing({ ...editing, errors: ex.fields || { typeCode: ex.message } });
    }
  }

  async function remove() {
    try {
      await api.del(`/api/app/profile/documents/${deleting.id}`);
      toast(t('Баримт устгагдлаа. Мэдүүлэгт хавсаргасан хуулбарууд хэвээр үлдэнэ.'));
      setDeleting(null);
      reload();
    } catch (ex) {
      toast(ex.message, 'danger');
    }
  }

  return (
    <Page
      crumb={[{ label: t('Мэдүүлэгч'), to: '/app' }, { label: t('Бичиг баримтын сан') }]}
      title={t('Бичиг баримтын сан')}
      subtitle={t(
        'Мэдүүлэгт давтан ашиглагдах баримтаа нэг удаа хадгална. Шинэ мэдүүлэгт тохирох баримт автоматаар хуулагдаж хавсрагдана.',
      )}
    >
      {loading && <Skeleton rows={4} />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <ExpiryWarnings warnings={data.warnings.filter((w) => w.kind === 'DOCUMENT')} />
          <div className="grid grid-2">
            <Card>
              <h2>{t('Баримт нэмэх')}</h2>
              <form className="stack" onSubmit={upload} noValidate>
                <MetaFields meta={meta} setMeta={setMeta} types={data.documentTypes} errors={errors} idPrefix="nd" />
                <Field label={t('Файл')} htmlFor="nd-file" error={errors.file} hint={t('PDF, JPG, PNG · ≤10 MB')} required>
                  <input id="nd-file" ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
                </Field>
                <div>
                  <Button type="submit" loading={busy}>
                    {t('Хадгалах')}
                  </Button>
                </div>
              </form>
            </Card>
            <Card>
              <h2>{t('Хэрхэн ажилладаг вэ?')}</h2>
              <ul className="small">
                <li>
                  {t('Шинэ мэдүүлгийн “Материал” алхамд шаардлага бүрт тохирох баримт автоматаар хавсрагдана — та шалгаж, сольж болно.')}
                </li>
                <li>{t('Мэдүүлэгт файлын ХУУЛБАР хавсрагдана: энд баримтаа сольсон, устгасан ч илгээсэн мэдүүлэг өөрчлөгдөхгүй.')}</li>
                <li>{t('Хугацаа дууссан баримтыг автоматаар хавсаргахгүй.')}</li>
                <li>{t('Зөвхөн та харна — оператор, админ энэ санг үзэх эрхгүй.')}</li>
              </ul>
            </Card>
          </div>

          <Card className="mt">
            <h2>{t('Хадгалсан баримтууд ({{v0}})', { v0: data.documents.length })}</h2>
            {!data.documents.length ? (
              <Empty title={t('Баримт хадгалаагүй байна')}>{t('Дээрх маягтаар эхний баримтаа нэмнэ үү.')}</Empty>
            ) : (
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t('Төрөл')}</th>
                      <th scope="col">{t('Файл')}</th>
                      <th scope="col">{t('Олгосон')}</th>
                      <th scope="col">{t('Хүчинтэй')}</th>
                      <th scope="col">
                        <span className="sr-only">{t('Үйлдэл')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((d) => {
                      const b = EXPIRY_BADGE[d.expiry];
                      return (
                        <tr key={d.id}>
                          <td>
                            {t(d.typeName)}
                            {d.title && <div className="small muted">{d.title}</div>}
                          </td>
                          <td>
                            {d.originalName}
                            <div className="small muted">{fmtBytes(d.sizeBytes)}</div>
                            <ScanBadge status={d.scanStatus} />
                          </td>
                          <td>{fmtDate(d.issuedOn) || '—'}</td>
                          <td>
                            {d.validUntil ? fmtDate(d.validUntil) : '—'} {b && <Badge tone={b[0]}>{b[1]()}</Badge>}
                          </td>
                          <td className="nowrap">
                            <Button
                              variant="ghost"
                              className="btn-sm"
                              disabled={d.scanStatus !== 'ACCEPTED'}
                              onClick={() => setViewing(asFile(d))}
                            >
                              {t('Нээх')}
                            </Button>{' '}
                            <Button
                              variant="ghost"
                              className="btn-sm"
                              onClick={() =>
                                setEditing({
                                  id: d.id,
                                  name: d.originalName,
                                  meta: {
                                    typeCode: d.typeCode,
                                    title: d.title || '',
                                    issuedOn: d.issuedOn || '',
                                    validUntil: d.validUntil || '',
                                  },
                                  errors: {},
                                })
                              }
                            >
                              {t('Засах')}
                            </Button>{' '}
                            <Button variant="ghost" className="btn-sm" onClick={() => setDeleting(d)}>
                              {t('Устгах')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
          {data.documents.length > 0 && (
            <Alert tone="info">{t('Хугацаа дуусахаас {{v0}} хоногийн өмнөөс анхааруулна.', { v0: data.warnDays })}</Alert>
          )}
        </>
      )}
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
      {editing && data && (
        <Modal
          open
          title={editing.name}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('Болих')}
              </Button>
              <Button onClick={saveEdit}>{t('Хадгалах')}</Button>
            </>
          }
        >
          <div className="stack">
            <MetaFields
              meta={editing.meta}
              setMeta={(m) => setEditing({ ...editing, meta: m })}
              types={data.documentTypes}
              errors={editing.errors}
              idPrefix="ed"
            />
          </div>
        </Modal>
      )}
      <Confirm
        open={!!deleting}
        title={t('Баримт устгах уу?')}
        tone="danger"
        confirmLabel={t('Устгах')}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      >
        {deleting &&
          t('“{{v0}}” баримтын санаас устгагдана. Өмнө нь мэдүүлэгт хавсаргасан хуулбарууд хэвээр үлдэнэ.', { v0: deleting.originalName })}
      </Confirm>
    </Page>
  );
}
