import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Badge, LinkButton, Alert, fmtDate, fmtDateTime, DL } from '../../components/ui.jsx';
import { FormSummary, DocumentList, FileViewer, ReviewTimeline, NotDecisionNote } from '../../components/shared.jsx';

// Зураг 48 Мэдүүлгийн дэлгэрэнгүй — илгээсэн мэдээллийг засахгүй
export default function ApplicationDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/applications/${id}`), [id]);
  const [viewing, setViewing] = useState(null);
  const a = data?.application;

  return (
    <Page
      crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Архив', to: '/app/applications' }, { label: id }]}
      title="Мэдүүлгийн дэлгэрэнгүй"
      subtitle={a && `${a.visa.country.name} · ${a.visa.code} — ${a.visa.name}`}
      actions={
        a && (
          <>
            <LinkButton variant="ghost" to="/app/official-result">
              Албан ёсны хариу шалгах
            </LinkButton>
            <LinkButton variant="ghost" to={`/app/new?version=${a.visa.versionId}&copyFrom=${a.publicId}`}>
              Мэдээллийг хуулж шинэ мэдүүлэг
            </LinkButton>
          </>
        )
      }
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton rows={5} />
      ) : (
        a && (
          <>
            {a.status === 'INCOMPLETE' && (
              <Alert tone="warn" title="Оператор нэмэлт материал шаардсан">
                {a.reviews[0]?.comment} Дутуу үнэлгээ нь автоматаар татгалзсан виз гэсэн үг биш. Операторын зааврын дагуу материалаа
                бүрдүүлнэ үү.
              </Alert>
            )}
            <div className="grid grid-main">
              <div>
                <Card>
                  <h2>Анкет</h2>
                  <FormSummary form={a.form} />
                </Card>
                <Card>
                  <h2>Хавсралт</h2>
                  <DocumentList requirements={a.requirements} documents={a.documents} onOpen={setViewing} />
                </Card>
              </div>
              <div>
                <Card>
                  <h2>Төлөв</h2>
                  <div className="small muted">Дотоод лавлах дугаар</div>
                  <div className="ref" style={{ fontSize: 18 }}>
                    {a.publicId}
                  </div>
                  <div className="mt">
                    <Badge status={a.status} />
                  </div>
                  <div className="mt">
                    <DL
                      items={[
                        ['Илгээсэн', fmtDateTime(a.submittedAt)],
                        ['Архивласан', fmtDateTime(a.archivedAt)],
                        ['Мэдээллийн хувилбар', `v${a.visa.versionNo} · шалгасан ${fmtDate(a.visa.verifiedAt)}`],
                      ]}
                    />
                  </div>
                  <div className="mt">
                    <NotDecisionNote />
                  </div>
                </Card>
                <Card>
                  <h2>Бүрдлийн үнэлгээний түүх</h2>
                  <ReviewTimeline reviews={a.reviews} />
                </Card>
              </div>
            </div>
          </>
        )
      )}
      <FileViewer doc={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}
