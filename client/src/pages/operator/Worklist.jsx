import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useState } from 'react';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, Field, Button, Pagination, fmtDate } from '../../components/ui.jsx';

const LATEST = { COMPLETE: ['ok', 'Бүрэн'], INCOMPLETE: ['warn', 'Дутуу'] };

// Зураг 51 Операторын ажлын жагсаалт — зөвхөн өөрт хуваарилсан мэдүүлэг
export default function Worklist() {
  const [sp, setSp] = useSearchParams();
  const params = {
    latest: sp.get('latest') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    q: sp.get('q') || '',
    status: sp.get('status') || '',
    sort: sp.get('sort') || 'submitted_asc',
    page: sp.get('page') || '1',
  };
  const [q, setQ] = useState(params.q);
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/operator/applications${qs(params)}`), [sp.toString()]);
  const stats = useAsync(() => api.get('/api/operator/stats'), []);
  const set = (k) => (e) => {
    const n = new URLSearchParams(sp);
    if (e.target.value) n.set(k, e.target.value);
    else n.delete(k);
    if (k !== 'page') n.delete('page'); // шүүлт солиход эхний хуудас
    setSp(n);
  };
  const s = stats.data?.byStatus || {};

  return (
    <Page crumb={[{ label: 'Оператор' }]} title="Ажлын жагсаалт" subtitle="Танд хуваарилагдсан мэдүүлгийн бүрдлийг шалгана">
      <div className="grid grid-4">
        <Card className="stat">
          <div className="num">{s.IN_REVIEW || 0}</div>
          <div className="lbl">Шалгах хүлээгдэж буй</div>
        </Card>
        <Card className="stat">
          <div className="num">{s.INCOMPLETE || 0}</div>
          <div className="lbl">Дутуу гэж үнэлсэн</div>
        </Card>
        <Card className="stat">
          <div className="num">{s.COMPLETE || 0}</div>
          <div className="lbl">Бүрэн</div>
        </Card>
        <Card className="stat">
          <div className="num">{stats.data?.reviewsToday ?? 0}</div>
          <div className="lbl">Өнөөдрийн үнэлгээ</div>
        </Card>
      </div>
      <form
        className="filters mt"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set('q')({ target: { value: q.trim() } });
        }}
      >
        <Field label="Хайх (лавлах дугаар, мэдүүлэгч)" htmlFor="wq">
          <input id="wq" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Төлөв" htmlFor="ws">
          <select id="ws" value={params.status} onChange={set('status')}>
            <option value="">Бүгд</option>
            <option value="IN_REVIEW">Бүрдэл хянаж байна</option>
            <option value="INCOMPLETE">Нэмэлт материал шаардсан</option>
            <option value="COMPLETE">Бүрдэл бүрэн</option>
            <option value="DELIVERED">Хүргүүлсэн</option>
          </select>
        </Field>
        <Field label="Эрэмбэ" htmlFor="wo">
          <select id="wo" value={params.sort} onChange={set('sort')}>
            <option value="submitted_asc">Илгээсэн (эртнээс)</option>
            <option value="submitted_desc">Илгээсэн (сүүлийнхээс)</option>
            <option value="status">Төлөвөөр</option>
            <option value="ref_asc">Лавлах дугаараар</option>
          </select>
        </Field>
        <Field label="Сүүлийн үнэлгээ" htmlFor="l">
          <select id="l" value={params.latest} onChange={set('latest')}>
            <option value="">Бүгд</option>
            <option value="NONE">Үнэлээгүй</option>
            <option value="INCOMPLETE">Дутуу</option>
            <option value="COMPLETE">Бүрэн</option>
          </select>
        </Field>
        <Field label="Илгээсэн (эхлэх)" htmlFor="f">
          <input id="f" type="date" value={params.from} onChange={set('from')} />
        </Field>
        <Field label="Илгээсэн (дуусах)" htmlFor="t">
          <input id="t" type="date" value={params.to} onChange={set('to')} />
        </Field>
        <Button type="submit" variant="ghost">
          Хайх
        </Button>
        {sp.toString() && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ('');
              setSp({});
            }}
          >
            Шүүлт цэвэрлэх
          </Button>
        )}
      </form>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title="Хуваарилсан мэдүүлэг алга">Админ танд мэдүүлэг хуваарилах үед энд харагдана.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Лавлах дугаар</th>
                  <th>Мэдүүлэгч</th>
                  <th>Төрөл</th>
                  <th>Илгээсэн</th>
                  <th>Файл</th>
                  <th>Сүүлийн үнэлгээ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.publicId}>
                    <td className="mono">{a.publicId}</td>
                    <td>{a.applicantName}</td>
                    <td>
                      {a.country} · {a.visaCode}
                    </td>
                    <td>{fmtDate(a.submittedAt)}</td>
                    <td>{a.documentCount}</td>
                    <td>
                      {a.latestReview ? (
                        <Badge tone={LATEST[a.latestReview][0]}>{LATEST[a.latestReview][1]}</Badge>
                      ) : (
                        <Badge tone="info">Үнэлээгүй</Badge>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-primary btn-sm" to={`/operator/applications/${a.publicId}`}>
                        Шалгах
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={(p) => set('page')({ target: { value: String(p) } })}
        />
      )}
    </Page>
  );
}
