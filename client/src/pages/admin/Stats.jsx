import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Field, Badge, TableWrap } from '../../components/ui.jsx';
import { BarChart } from '../../components/BarChart.jsx';
import { t } from '../../i18n.js';
const STATUS = [
  ['SUBMITTED', t('Илгээсэн')],
  ['IN_REVIEW', t('Хянаж байна')],
  ['INCOMPLETE', t('Нэмэлт материал')],
  ['COMPLETE', t('Бүрдэл бүрэн')],
  ['DELIVERED', t('Хүргүүлсэн')],
];
/** Тэнхлэгийн богино шошго: 2026-W47 → W47, 2026-11 → 11-р сар */
const shortLabel = (b) =>
  b.includes('-W')
    ? b.split('-')[1]
    : t('{{v0}}-р сар', {
        v0: Number(b.slice(5)),
      });
const h = (v) =>
  v === null || v === undefined
    ? '—'
    : t('{{v0}} цаг', {
        v0: v,
      });

// Үе 4 — тайлан/статистик. Зөвхөн нэгтгэсэн тоо (хувийн мэдээлэлгүй).
export default function Stats() {
  const [sp, setSp] = useSearchParams();
  const period = sp.get('period') === 'month' ? 'month' : 'week';
  const count = period === 'week' ? 12 : 12;
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/stats?period=${period}&count=${count}`), [period]);
  const unitLabel = period === 'week' ? t('долоо хоног') : t('сар');
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Статистик'),
        },
      ]}
      title={t('Тайлан ба статистик')}
      subtitle={t('Нэгтгэсэн тоо — мэдүүлэгчийн хувийн мэдээлэл агуулахгүй')}
    >
      <div className="filters">
        <Field label={t('Хугацааны нэгж')} htmlFor="sp">
          <select
            id="sp"
            value={period}
            onChange={(e) =>
              setSp({
                period: e.target.value,
              })
            }
          >
            <option value="week">{t('Долоо хоногоор (сүүлийн 12)')}</option>
            <option value="month">{t('Сараар (сүүлийн 12)')}</option>
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
                  {t('Илгээлт (')}
                  {count} {unitLabel})
                </div>
              </Card>
              <Card className="stat">
                <div className="num">{h(data.timeToFirstReview.medianHours)}</div>
                <div className="lbl">{t('Эхний үнэлгээ хүртэл (медиан)')}</div>
              </Card>
              <Card className="stat">
                <div className="num">{h(data.timeToFirstReview.p90Hours)}</div>
                <div className="lbl">{t('Эхний үнэлгээ хүртэл (90%)')}</div>
              </Card>
              <Card className="stat">
                <div
                  className="num"
                  style={{
                    color: data.unassignedOpen ? 'var(--warn)' : undefined,
                  }}
                >
                  {data.unassignedOpen}
                </div>
                <div className="lbl">{t('Хуваарилаагүй нээлттэй')}</div>
              </Card>
            </div>
            <div className="grid grid-2 mt">
              <Card>
                <h2>
                  {t('Илгээлт (')}
                  {unitLabel}
                  {t('оор)')}
                </h2>
                <BarChart
                  title={t('Илгээсэн мэдүүлэг, {{v0}} тутам', {
                    v0: unitLabel,
                  })}
                  integer
                  data={data.series.map((s) => ({
                    label: s.bucket,
                    short: shortLabel(s.bucket),
                    value: s.submitted,
                  }))}
                />
              </Card>
              <Card>
                <h2>{t('Эхний бүрдлийн үнэлгээ хүртэлх хугацаа')}</h2>
                <BarChart
                  title={t('Медиан хугацаа (цаг), илгээсэн {{v0}}өөр', {
                    v0: unitLabel,
                  })}
                  unit={t(' цаг')}
                  data={data.series.map((s) => ({
                    label: s.bucket,
                    short: shortLabel(s.bucket),
                    value: s.medianHoursToFirstReview,
                  }))}
                />
                <p className="small muted mb0">
                  {t('Илгээснээс операторын эхний “Бүрэн/Дутуу” үнэлгээ хүртэл. Үнэлгээгүй мэдүүлэг орохгүй.')}
                </p>
              </Card>
            </div>
            <div className="grid grid-2 mt">
              <Card>
                <h2>{t('Операторын ачаалал')}</h2>
                <TableWrap>
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Оператор')}</th>
                        <th>{t('Нээлттэй')}</th>
                        <th>{t('Үнэлгээ')}</th>
                        <th>{t('Хүргүүлсэн')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.operators.map((o) => (
                        <tr key={o.id}>
                          <td>
                            {o.name} {!o.active && <Badge tone="muted">{t('Идэвхгүй')}</Badge>}
                          </td>
                          <td>{o.open}</td>
                          <td>{o.reviews}</td>
                          <td>{o.handovers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
                <p className="small muted mb0">{t('Үнэлгээ, хүргүүлсэн — сонгосон хугацаанд.')}</p>
              </Card>
              <Card>
                <h2>{t('Төлөвийн хуваарилалт (одоо)')}</h2>
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
                <p className="small muted mb0">{t('Бүрдлийн төлөв нь визийн шийдвэр биш.')}</p>
              </Card>
            </div>
          </>
        )
      )}
    </Page>
  );
}
