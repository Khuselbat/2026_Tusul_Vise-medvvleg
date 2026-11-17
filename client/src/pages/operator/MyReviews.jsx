import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, fmtDateTime } from '../../components/ui.jsx';

export default function MyReviews() {
  const { data, error, loading, reload } = useAsync(() => api.get('/api/operator/reviews'), []);
  return (
    <Page crumb={[{ label: 'Оператор', to: '/operator' }, { label: 'Үнэлгээний түүх' }]} title="Миний үнэлгээний түүх" subtitle="Таны оруулсан бүх бүрдлийн үнэлгээ">
      <ErrorBox error={error} onRetry={reload} />
      {loading ? <Skeleton rows={4} /> : data && (data.items.length === 0 ? <Empty title="Үнэлгээ оруулаагүй байна" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Огноо</th><th>Лавлах дугаар</th><th>Төрөл</th><th>#</th><th>Үнэлгээ</th><th>Тайлбар</th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={`${r.publicId}-${r.reviewNo}`}>
                  <td>{fmtDateTime(r.reviewedAt)}</td>
                  <td className="mono">{r.stillAssigned ? <Link to={`/operator/applications/${r.publicId}`}>{r.publicId}</Link> : r.publicId}</td>
                  <td>{r.visaCode}</td>
                  <td>{r.reviewNo}</td>
                  <td><Badge tone={r.completeness === 'COMPLETE' ? 'ok' : 'warn'}>{r.completeness === 'COMPLETE' ? 'Бүрэн' : 'Дутуу'}</Badge></td>
                  <td className="small">{r.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Page>
  );
}
