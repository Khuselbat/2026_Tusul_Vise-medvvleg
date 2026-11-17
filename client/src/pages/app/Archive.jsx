import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, LinkButton, Field, Pagination, fmtDate } from '../../components/ui.jsx';

// Зураг 47 Миний мэдүүлгийн архив — огноо, төрөл, бүрдлийн төлөвөөр шүүнэ (серверийн шүүлт)
export default function Archive() {
  const [sp, setSp] = useSearchParams();
  const params = {
    status: sp.get('status') || '',
    visaTypeId: sp.get('visaTypeId') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    q: sp.get('q') || '',
    page: sp.get('page') || '1',
  };
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/applications${qs(params)}`), [sp.toString()]);
  const set = (k) => (e) => {
    const n = new URLSearchParams(sp);
    if (e.target.value) n.set(k, e.target.value);
    else n.delete(k);
    n.delete('page');
    setSp(n);
  };
  const filtered = ['status', 'visaTypeId', 'from', 'to', 'q'].some((k) => sp.get(k));

  return (
    <Page
      crumb={[{ label: 'Мэдүүлэгч', to: '/app' }, { label: 'Архив' }]}
      title="Миний мэдүүлгийн архив"
      subtitle="Илгээсэн бүх мэдүүлэг, анкет, хавсралт"
      actions={<LinkButton to="/app/new">Шинэ мэдүүлэг</LinkButton>}
    >
      <div className="filters">
        <Field label="Лавлах дугаар" htmlFor="q">
          <input id="q" value={params.q} onChange={set('q')} placeholder="KR-…" />
        </Field>
        <Field label="Төлөв" htmlFor="st">
          <select id="st" value={params.status} onChange={set('status')}>
            <option value="">Бүгд</option>
            <option value="SUBMITTED">Илгээсэн</option>
            <option value="IN_REVIEW">Бүрдэл хянаж байна</option>
            <option value="INCOMPLETE">Нэмэлт материал шаардсан</option>
            <option value="COMPLETE">Бүрдэл бүрэн</option>
          </select>
        </Field>
        <Field label="Визийн төрөл" htmlFor="vt">
          <select id="vt" value={params.visaTypeId} onChange={set('visaTypeId')}>
            <option value="">Бүгд</option>
            {data?.visaTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Эхлэх огноо" htmlFor="from">
          <input id="from" type="date" value={params.from} onChange={set('from')} />
        </Field>
        <Field label="Дуусах огноо" htmlFor="to">
          <input id="to" type="date" value={params.to} onChange={set('to')} />
        </Field>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          filtered ? (
            <Empty
              title="Шүүлтэд тохирох мэдүүлэг олдсонгүй"
              action={
                <Button variant="ghost" onClick={() => setSp({})}>
                  Шүүлт цэвэрлэх
                </Button>
              }
            />
          ) : (
            <Empty title="Архив хоосон байна" action={<LinkButton to="/app/new">Шинэ мэдүүлэг</LinkButton>}>
              Илгээсэн мэдүүлэг энд хадгалагдана.
            </Empty>
          )
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Лавлах дугаар</th>
                    <th>Улс · төрөл</th>
                    <th>Илгээсэн огноо</th>
                    <th>Бүрдлийн төлөв</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.publicId}>
                      <td className="mono">{a.publicId}</td>
                      <td>
                        {a.country} · {a.visaCode}
                        <div className="small muted">{a.visaName}</div>
                      </td>
                      <td>{fmtDate(a.submittedAt)}</td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td>
                        <Link to={`/app/applications/${a.publicId}`}>Дэлгэрэнгүй</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(p) => {
                const n = new URLSearchParams(sp);
                n.set('page', p);
                setSp(n);
              }}
            />
          </>
        ))
      )}
    </Page>
  );
}
