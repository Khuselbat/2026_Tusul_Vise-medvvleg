import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, Field, Button, fmtDate } from '../../components/ui.jsx';

const LATEST = { COMPLETE: ['ok', 'Бүрэн'], INCOMPLETE: ['warn', 'Дутуу'] };

// Зураг 51 Операторын ажлын жагсаалт — зөвхөн өөрт хуваарилсан мэдүүлэг
export default function Worklist() {
  const [sp, setSp] = useSearchParams();
  const params = { latest: sp.get('latest') || '', from: sp.get('from') || '', to: sp.get('to') || '' };
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/operator/applications${qs(params)}`), [sp.toString()]);
  const stats = useAsync(() => api.get('/api/operator/stats'), []);
  const set = (k) => (e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set(k, e.target.value); else n.delete(k); setSp(n); };
  const s = stats.data?.byStatus || {};

  return (
    <Page crumb={[{ label: 'Оператор' }]} title="Ажлын жагсаалт" subtitle="Танд хуваарилагдсан мэдүүлгийн бүрдлийг шалгана">
      <div className="grid grid-4">
        <Card className="stat"><div className="num">{s.IN_REVIEW || 0}</div><div className="lbl">Шалгах хүлээгдэж буй</div></Card>
        <Card className="stat"><div className="num">{s.INCOMPLETE || 0}</div><div className="lbl">Дутуу гэж үнэлсэн</div></Card>
        <Card className="stat"><div className="num">{s.COMPLETE || 0}</div><div className="lbl">Бүрэн</div></Card>
        <Card className="stat"><div className="num">{stats.data?.reviewsToday ?? 0}</div><div className="lbl">Өнөөдрийн үнэлгээ</div></Card>
      </div>
      <div className="filters mt">
        <Field label="Сүүлийн үнэлгээ" htmlFor="l">
          <select id="l" value={params.latest} onChange={set('latest')}>
            <option value="">Бүгд</option><option value="NONE">Үнэлээгүй</option><option value="INCOMPLETE">Дутуу</option><option value="COMPLETE">Бүрэн</option>
          </select>
        </Field>
        <Field label="Илгээсэн (эхлэх)" htmlFor="f"><input id="f" type="date" value={params.from} onChange={set('from')} /></Field>
        <Field label="Илгээсэн (дуусах)" htmlFor="t"><input id="t" type="date" value={params.to} onChange={set('to')} /></Field>
        {sp.toString() && <Button variant="ghost" onClick={() => setSp({})}>Шүүлт цэвэрлэх</Button>}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Skeleton rows={4} /> : data && (data.items.length === 0
        ? <Empty title="Хуваарилсан мэдүүлэг алга">Админ танд мэдүүлэг хуваарилах үед энд харагдана.</Empty>
        : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Лавлах дугаар</th><th>Мэдүүлэгч</th><th>Төрөл</th><th>Илгээсэн</th><th>Файл</th><th>Сүүлийн үнэлгээ</th><th /></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.publicId}>
                    <td className="mono">{a.publicId}</td>
                    <td>{a.applicantName}</td>
                    <td>{a.country} · {a.visaCode}</td>
                    <td>{fmtDate(a.submittedAt)}</td>
                    <td>{a.documentCount}</td>
                    <td>{a.latestReview ? <Badge tone={LATEST[a.latestReview][0]}>{LATEST[a.latestReview][1]}</Badge> : <Badge tone="info">Үнэлээгүй</Badge>}</td>
                    <td><Link className="btn btn-primary btn-sm" to={`/operator/applications/${a.publicId}`}>Шалгах</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Page>
  );
}
