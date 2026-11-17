import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Field, Badge } from '../../components/ui.jsx';
import { BarChart } from '../../components/BarChart.jsx';

const STATUS = [
  ['SUBMITTED', 'Илгээсэн'],
  ['IN_REVIEW', 'Хянаж байна'],
  ['INCOMPLETE', 'Нэмэлт материал'],
  ['COMPLETE', 'Бүрдэл бүрэн'],
  ['DELIVERED', 'Хүргүүлсэн'],
];
/** Тэнхлэгийн богино шошго: 2026-W47 → W47, 2026-11 → 11-р сар */
const shortLabel = (b) => (b.includes('-W') ? b.split('-')[1] : `${Number(b.slice(5))}-р сар`);
const h = (v) => (v === null || v === undefined ? '—' : `${v} цаг`);

// Үе 4 — тайлан/статистик. Зөвхөн нэгтгэсэн тоо (хувийн мэдээлэлгүй).
export default function Stats() {
  const [sp, setSp] = useSearchParams();
  const period = sp.get('period') === 'month' ? 'month' : 'week';
  const count = period === 'week' ? 12 : 12;
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/stats?period=${period}&count=${count}`), [period]);
  const unitLabel = period === 'week' ? 'долоо хоног' : 'сар';

  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Статистик' }]}
      title="Тайлан ба статистик"
      subtitle="Нэгтгэсэн тоо — мэдүүлэгчийн хувийн мэдээлэл агуулахгүй"
    >
      <div className="filters">
        <Field label="Хугацааны нэгж" htmlFor="sp">
          <select id="sp" value={period} onChange={(e) => setSp({ period: e.target.value })}>
            <option value="week">Долоо хоногоор (сүүлийн 12)</option>
            <option value="month">Сараар (сүүлийн 12)</option>
          </select>
        </Field>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={5} />
      ) : (
        data && (
          <>
            <div className="grid grid-4">
              <Card className="stat">
                <div className="num">{data.series.reduce((s, x) => s + x.submitted, 0)}</div>
                <div className="lbl">
                  Илгээлт ({count} {unitLabel})
                </div>
              </Card>
              <Card className="stat">
                <div className="num">{h(data.timeToFirstReview.medianHours)}</div>
                <div className="lbl">Эхний үнэлгээ хүртэл (медиан)</div>
              </Card>
              <Card className="stat">
                <div className="num">{h(data.timeToFirstReview.p90Hours)}</div>
                <div className="lbl">Эхний үнэлгээ хүртэл (90%)</div>
              </Card>
              <Card className="stat">
                <div className="num" style={{ color: data.unassignedOpen ? 'var(--warn)' : undefined }}>
                  {data.unassignedOpen}
                </div>
                <div className="lbl">Хуваарилаагүй нээлттэй</div>
              </Card>
            </div>
            <div className="grid grid-2 mt">
              <Card>
                <h2>Илгээлт ({unitLabel}оор)</h2>
                <BarChart
                  title={`Илгээсэн мэдүүлэг, ${unitLabel} тутам`}
                  integer
                  data={data.series.map((s) => ({ label: s.bucket, short: shortLabel(s.bucket), value: s.submitted }))}
                />
              </Card>
              <Card>
                <h2>Эхний бүрдлийн үнэлгээ хүртэлх хугацаа</h2>
                <BarChart
                  title={`Медиан хугацаа (цаг), илгээсэн ${unitLabel}өөр`}
                  unit=" цаг"
                  data={data.series.map((s) => ({ label: s.bucket, short: shortLabel(s.bucket), value: s.medianHoursToFirstReview }))}
                />
                <p className="small muted mb0">Илгээснээс операторын эхний “Бүрэн/Дутуу” үнэлгээ хүртэл. Үнэлгээгүй мэдүүлэг орохгүй.</p>
              </Card>
            </div>
            <div className="grid grid-2 mt">
              <Card>
                <h2>Операторын ачаалал</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Оператор</th>
                        <th>Нээлттэй</th>
                        <th>Үнэлгээ</th>
                        <th>Хүргүүлсэн</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.operators.map((o) => (
                        <tr key={o.id}>
                          <td>
                            {o.name} {!o.active && <Badge tone="muted">Идэвхгүй</Badge>}
                          </td>
                          <td>{o.open}</td>
                          <td>{o.reviews}</td>
                          <td>{o.handovers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small muted mb0">Үнэлгээ, хүргүүлсэн — сонгосон хугацаанд.</p>
              </Card>
              <Card>
                <h2>Төлөвийн хуваарилалт (одоо)</h2>
                <table>
                  <tbody>
                    {STATUS.map(([k, l]) => (
                      <tr key={k}>
                        <td>{l}</td>
                        <td>{data.byStatus[k] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="small muted mb0">Бүрдлийн төлөв нь визийн шийдвэр биш.</p>
              </Card>
            </div>
          </>
        )
      )}
    </Page>
  );
}
