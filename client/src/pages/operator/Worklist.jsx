import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useState } from 'react';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, Field, Button, Pagination, fmtDate } from '../../components/ui.jsx';
import { t } from '../../i18n.js';
const LATEST = {
  COMPLETE: ['ok', t('Бүрэн')],
  INCOMPLETE: ['warn', t('Дутуу')],
};

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
    <Page
      crumb={[
        {
          label: t('Оператор'),
        },
      ]}
      title={t('Ажлын жагсаалт')}
      subtitle={t('Танд хуваарилагдсан мэдүүлгийн бүрдлийг шалгана')}
    >
      <div className="grid grid-4">
        <Card className="stat">
          <div className="num">{s.IN_REVIEW || 0}</div>
          <div className="lbl">{t('Шалгах хүлээгдэж буй')}</div>
        </Card>
        <Card className="stat">
          <div className="num">{s.INCOMPLETE || 0}</div>
          <div className="lbl">{t('Дутуу гэж үнэлсэн')}</div>
        </Card>
        <Card className="stat">
          <div className="num">{s.COMPLETE || 0}</div>
          <div className="lbl">{t('Бүрэн')}</div>
        </Card>
        <Card className="stat">
          <div className="num">{stats.data?.reviewsToday ?? 0}</div>
          <div className="lbl">{t('Өнөөдрийн үнэлгээ')}</div>
        </Card>
      </div>
      <form
        className="filters mt"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          set('q')({
            target: {
              value: q.trim(),
            },
          });
        }}
      >
        <Field label={t('Хайх (лавлах дугаар, мэдүүлэгч)')} htmlFor="wq">
          <input id="wq" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t('Төлөв')} htmlFor="ws">
          <select id="ws" value={params.status} onChange={set('status')}>
            <option value="">{t('Бүгд')}</option>
            <option value="IN_REVIEW">{t('Бүрдэл хянаж байна')}</option>
            <option value="INCOMPLETE">{t('Нэмэлт материал шаардсан')}</option>
            <option value="COMPLETE">{t('Бүрдэл бүрэн')}</option>
            <option value="DELIVERED">{t('Хүргүүлсэн')}</option>
          </select>
        </Field>
        <Field label={t('Эрэмбэ')} htmlFor="wo">
          <select id="wo" value={params.sort} onChange={set('sort')}>
            <option value="submitted_asc">{t('Илгээсэн (эртнээс)')}</option>
            <option value="submitted_desc">{t('Илгээсэн (сүүлийнхээс)')}</option>
            <option value="status">{t('Төлөвөөр')}</option>
            <option value="ref_asc">{t('Лавлах дугаараар')}</option>
          </select>
        </Field>
        <Field label={t('Сүүлийн үнэлгээ')} htmlFor="l">
          <select id="l" value={params.latest} onChange={set('latest')}>
            <option value="">{t('Бүгд')}</option>
            <option value="NONE">{t('Үнэлээгүй')}</option>
            <option value="INCOMPLETE">{t('Дутуу')}</option>
            <option value="COMPLETE">{t('Бүрэн')}</option>
          </select>
        </Field>
        <Field label={t('Илгээсэн (эхлэх)')} htmlFor="f">
          <input id="f" type="date" value={params.from} onChange={set('from')} />
        </Field>
        <Field label={t('Илгээсэн (дуусах)')} htmlFor="t">
          <input id="t" type="date" value={params.to} onChange={set('to')} />
        </Field>
        <Button type="submit" variant="ghost">
          {t('Хайх')}
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
            {t('Шүүлт цэвэрлэх')}
          </Button>
        )}
      </form>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={t('Хуваарилсан мэдүүлэг алга')}>{t('Админ танд мэдүүлэг хуваарилах үед энд харагдана.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Лавлах дугаар')}</th>
                  <th>{t('Мэдүүлэгч')}</th>
                  <th>{t('Төрөл')}</th>
                  <th>{t('Илгээсэн')}</th>
                  <th>{t('Файл')}</th>
                  <th>{t('Сүүлийн үнэлгээ')}</th>
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
                        <Badge tone="info">{t('Үнэлээгүй')}</Badge>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-primary btn-sm" to={`/operator/applications/${a.publicId}`}>
                        {t('Шалгах')}
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
          onPage={(p) =>
            set('page')({
              target: {
                value: String(p),
              },
            })
          }
        />
      )}
    </Page>
  );
}
