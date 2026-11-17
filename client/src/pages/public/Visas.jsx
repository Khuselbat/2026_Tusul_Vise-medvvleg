import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { api, qs } from '../../api.js';
import { Page, Card, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, fmtDate, Field } from '../../components/ui.jsx';

// Зураг 40 Визийн мэдээлэл хайх — зөвхөн нийтэлсэн хувилбарууд
export default function Visas() {
  const [sp, setSp] = useSearchParams();
  const country = sp.get('country') || '';
  const q = sp.get('q') || '';
  const [text, setText] = useState(q);
  const countries = useAsync(() => api.get('/api/countries'), []);
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/visas${qs({ country, q })}`), [country, q]);

  const update = (patch) => {
    const n = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    setSp(n);
  };

  return (
    <Page crumb={[{ label: 'Визийн мэдээлэл' }]} title="Визийн мэдээлэл хайх" subtitle="Ангилал, бүрдүүлэх материал, эх сурвалж, шалгасан огноо">
      <form className="filters" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() }); }}>
        <Field label="Улс" htmlFor="c">
          <select id="c" value={country} onChange={(e) => update({ country: e.target.value })}>
            <option value="">Бүгд</option>
            {countries.data?.countries.map((c) => <option key={c.id} value={c.iso}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Нэр эсвэл код" htmlFor="q" className="grow">
          <input id="q" placeholder="ж: C-3-9, аялал" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button type="submit">Хайх</Button>
      </form>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? <Skeleton rows={3} /> : data?.visas.length === 0 ? (
        <Empty title="Үр дүн олдсонгүй" action={<Button variant="ghost" onClick={() => { setText(''); setSp({}); }}>Хайлтаа өөрчлөх</Button>}>
          Өөр нэр, код эсвэл улсаар хайна уу.
        </Empty>
      ) : (
        <div className="grid grid-2">
          {data?.visas.map((v) => (
            <Link key={v.versionId} to={`/visas/${v.versionId}`} className="card visa-card">
              <div className="between">
                <span className="code">{v.country.name} · {v.code}</span>
                {v.canApply ? <Badge tone="ok">Мэдүүлэг авна</Badge> : <Badge tone="muted">Зөвхөн мэдээлэл</Badge>}
              </div>
              <h3>{v.name}</h3>
              <p className="muted small mb0" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.description}</p>
              <div className="kv-inline">
                <span>Материал: {v.requirementCount}</span>
                <span>Шалгасан: {fmtDate(v.verifiedAt)}</span>
                <span>Хувилбар v{v.versionNo}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
