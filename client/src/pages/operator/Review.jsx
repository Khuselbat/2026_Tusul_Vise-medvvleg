import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  Card,
  useAsync,
  ErrorBox,
  Skeleton,
  Button,
  LinkButton,
  Field,
  Confirm,
  Alert,
  Badge,
  useToast,
  fmtDateTime,
} from '../../components/ui.jsx';
import { FormSummary, DocumentList, FileViewer, ReviewTimeline, usePendingScanPoll } from '../../components/shared.jsx';
import { SupplementHistory, HandoverCard, HandoverForm, OfficialResults } from '../../components/records.jsx';

// Зураг 52 / UC-07 Материал шалгаж үнэлэх. Виз зөвшөөрөх/татгалзах товч байхгүй (BR-09).
export default function Review() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/operator/applications/${id}`), [id]);
  usePendingScanPoll(data, reload);
  const [viewing, setViewing] = useState(null);
  const [val, setVal] = useState('');
  const [comment, setComment] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflictMsg, setConflictMsg] = useState('');
  const a = data?.application;

  function ask() {
    const fe = {};
    if (!val) fe.completeness = 'Бүрэн эсвэл дутуу гэдгийг сонгоно уу.';
    if (val === 'INCOMPLETE' && !comment.trim()) fe.comment = 'Дутуу гэж үнэлэхэд шалтгааныг заавал бичнэ.';
    setFieldErr(fe);
    if (!Object.keys(fe).length) setOpen(true);
  }

  async function save() {
    setBusy(true);
    setConflictMsg('');
    try {
      await api.post(`/api/operator/applications/${id}/reviews`, {
        completeness: val,
        comment,
        expectedReviewNo: a.reviews[0]?.reviewNo || 0,
      });
      toast('Үнэлгээ хадгалагдлаа.');
      setVal('');
      setComment('');
      setOpen(false);
      reload();
    } catch (ex) {
      setOpen(false);
      if (ex.status === 409) {
        setConflictMsg(ex.message);
        reload();
      } else setFieldErr(ex.fields?.comment ? ex.fields : { _: ex.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      crumb={[{ label: 'Оператор', to: '/operator' }, { label: id }]}
      title="Материал шалгаж үнэлэх"
      subtitle={a && `${a.visa.country.name} · ${a.visa.code} — ${a.visa.name}`}
      actions={
        <>
          <LinkButton variant="ghost" to={`/operator/applications/${id}/history`}>
            Түүх харах
          </LinkButton>
          <LinkButton variant="ghost" to="/operator">
            Жагсаалт руу
          </LinkButton>
        </>
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {conflictMsg && <Alert tone="warn">{conflictMsg} Мэдээллийг дахин уншлаа.</Alert>}
      {loading && !a ? (
        <Skeleton rows={5} />
      ) : (
        a && (
          <div className="grid grid-main">
            <div>
              <Card>
                <div className="between">
                  <h2>Анкет</h2>
                  <span className="small muted">Мэдүүлэгч: {a.applicantName}</span>
                </div>
                <FormSummary form={a.form} />
                <p className="small muted mb0 mt">Паспортын дугаар нууцлагдсан — хавсаргасан паспортын хуулбартай тулгана уу.</p>
              </Card>
              <Card>
                <h2>Материал (анхны илгээлт)</h2>
                <DocumentList requirements={a.requirements} documents={a.documents} onOpen={setViewing} />
              </Card>
              <SupplementHistory supplements={a.supplements} requirements={a.requirements} onOpen={setViewing} />
            </div>
            <div>
              {a.status === 'DELIVERED' && <HandoverCard handover={a.handover} onOpen={setViewing} />}
              {a.status !== 'DELIVERED' && (
                <Card>
                  <h2>Бүрдлийн үнэлгээ</h2>
                  <div className="small muted">Одоогийн төлөв</div>
                  <div style={{ margin: '4px 0 14px' }}>
                    <Badge status={a.status} /> <span className="small muted">илгээсэн {fmtDateTime(a.submittedAt)}</span>
                  </div>
                  <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
                    <legend className="small muted" style={{ marginBottom: 8 }}>
                      Үнэлгээ
                    </legend>
                    <div className="radio-row">
                      <label className="radio">
                        <input type="radio" name="c" checked={val === 'COMPLETE'} onChange={() => setVal('COMPLETE')} /> Бүрэн
                      </label>
                      <label className="radio">
                        <input type="radio" name="c" checked={val === 'INCOMPLETE'} onChange={() => setVal('INCOMPLETE')} /> Дутуу
                      </label>
                    </div>
                    {fieldErr.completeness && <div className="field-error">{fieldErr.completeness}</div>}
                  </fieldset>
                  <Field
                    label="Тайлбар"
                    htmlFor="cm"
                    error={fieldErr.comment}
                    hint={val === 'INCOMPLETE' ? 'Дутуу бол шалтгааныг заавал бичнэ' : 'Сонголттой'}
                  >
                    <textarea
                      id="cm"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Дутуу бол шалтгааныг заавал бичнэ"
                      maxLength={4000}
                    />
                  </Field>
                  {fieldErr._ && <Alert tone="danger">{fieldErr._}</Alert>}
                  <div className="mt">
                    <Button onClick={ask}>Үнэлгээ хадгалах</Button>
                  </div>
                  <p className="small muted mt mb0">
                    Энэ нь материалын бүрдлийн үнэлгээ — виз олгох шийдвэр биш. Хадгалсан үнэлгээг засах, устгах боломжгүй; шинэ үнэлгээ
                    нэмнэ.
                  </p>
                </Card>
              )}
              {a.status === 'COMPLETE' && <HandoverForm publicId={a.publicId} onDone={reload} />}
              <Card>
                <h2>Өмнөх үнэлгээ</h2>
                <ReviewTimeline reviews={a.reviews.slice(0, 3)} />
              </Card>
              <OfficialResults app={a} mode="operator" onChanged={reload} onOpen={setViewing} />
            </div>
          </div>
        )
      )}
      <Confirm open={open} title="Үнэлгээ хадгалах уу?" loading={busy} onClose={() => setOpen(false)} onConfirm={save}>
        <p>
          Мэдүүлэг <strong className="mono">{id}</strong>-д <strong>{val === 'COMPLETE' ? '“Бүрэн”' : '“Дутуу”'}</strong> гэсэн үнэлгээ шинэ
          мөрөөр бүртгэгдэж, мэдүүлэгчид харагдана.
        </p>
        {comment && <p className="small muted">Тайлбар: {comment}</p>}
      </Confirm>
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
