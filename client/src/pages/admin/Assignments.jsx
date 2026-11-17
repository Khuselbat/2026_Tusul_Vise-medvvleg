import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  useAsync,
  ErrorBox,
  Skeleton,
  Empty,
  Badge,
  Button,
  Confirm,
  useToast,
  Alert,
  Field,
  fmtDate,
} from '../../components/ui.jsx';

// Зураг 60 Мэдүүлэг операторт хуваарилах — зөвхөн metadata
export default function Assignments() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('filter') || 'unassigned';
  const search = sp.get('q') || '';
  const { data, error, loading, reload } = useAsync(
    () => api.get(`/api/admin/assignments?filter=${filter}&q=${encodeURIComponent(search)}`),
    [filter, search],
  );
  // Үе 4: олноор сонгож хуваарилах
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOp, setBulkOp] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [q, setQ] = useState(search);
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const visible = data?.items || [];
  const allSelected = visible.length > 0 && visible.every((a) => selected.has(a.publicId));

  async function applyBulk() {
    setBusy(true);
    setConflict('');
    try {
      const items = visible
        .filter((a) => selected.has(a.publicId))
        .map((a) => ({ publicId: a.publicId, expectedOperatorId: a.operatorId ?? null }));
      const r = await api.put('/api/admin/assignments', { operatorId: Number(bulkOp), items });
      toast(`${r.assigned} мэдүүлэг хуваарилагдлаа.`);
      setSelected(new Set());
      setBulkOpen(false);
      reload();
    } catch (ex) {
      setBulkOpen(false);
      if (ex.status === 409) {
        setConflict(`${ex.message} (${ex.conflicts.join(', ')})`);
        reload();
      } else toast(ex.message, 'danger');
    } finally {
      setBusy(false);
    }
  }
  const [pick, setPick] = useState({});
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');

  const opName = (id) => data?.operators.find((o) => o.id === id)?.name;

  async function apply() {
    setBusy(true);
    setConflict('');
    try {
      await api.put(`/api/admin/assignments/${pending.item.publicId}`, {
        operatorId: pending.to,
        expectedOperatorId: pending.item.operatorId ?? null,
      });
      toast(pending.to ? 'Хуваарилагдлаа.' : 'Хуваарилалт цуцлагдлаа.', pending.to ? 'ok' : 'info');
      setPending(null);
      reload();
    } catch (ex) {
      setPending(null);
      if (ex.status === 409) {
        setConflict(ex.message);
        reload();
      } else toast(ex.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Хуваарилалт' }]}
      title="Мэдүүлэг операторт хуваарилах"
      subtitle="Идэвхтэй операторт хуваарилах, дахин хуваарилах, цуцлах"
    >
      <div className="filters">
        <Field label="Харах" htmlFor="f">
          <select
            id="f"
            value={filter}
            onChange={(e) => {
              setSelected(new Set());
              setSp({ filter: e.target.value, ...(search ? { q: search } : {}) });
            }}
          >
            <option value="unassigned">Хуваарилаагүй</option>
            <option value="assigned">Хуваарилсан</option>
            <option value="all">Бүгд</option>
          </select>
        </Field>
        <form
          role="search"
          className="row-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setSelected(new Set());
            setSp({ filter, ...(q.trim() ? { q: q.trim() } : {}) });
          }}
        >
          <Field label="Лавлах дугаар" htmlFor="aq">
            <input id="aq" type="search" value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Button type="submit" variant="ghost">
            Хайх
          </Button>
        </form>
        {data && (
          <div className="small muted" style={{ paddingBottom: 10 }}>
            Операторын ачаалал: {data.operators.map((o) => `${o.name} (${o.openCount})`).join(' · ') || 'идэвхтэй оператор алга'}
          </div>
        )}
      </div>
      {conflict && <Alert tone="warn">{conflict} Жагсаалтыг дахин уншлаа.</Alert>}
      {selected.size > 0 && data && (
        <div className="bulk-bar" role="region" aria-label="Олноор хуваарилах">
          <strong>{selected.size} сонгосон</strong>
          <select aria-label="Хуваарилах оператор" value={bulkOp} onChange={(e) => setBulkOp(e.target.value)}>
            <option value="">— оператор сонгох —</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.openCount})
              </option>
            ))}
          </select>
          <Button className="btn-sm" disabled={!bulkOp} onClick={() => setBulkOpen(true)}>
            Сонгосныг хуваарилах
          </Button>
          <Button className="btn-sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Сонголт арилгах
          </Button>
        </div>
      )}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={filter === 'unassigned' ? 'Хуваарилаагүй мэдүүлэг алга' : 'Мэдүүлэг алга'} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Бүгдийг сонгох"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((a) => a.publicId)))}
                    />
                  </th>
                  <th>Лавлах дугаар</th>
                  <th>Улс · төрөл</th>
                  <th>Илгээсэн</th>
                  <th>Төлөв</th>
                  <th>Одоогийн оператор</th>
                  <th>Оператор сонгох</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => {
                  const sel = pick[a.publicId] ?? '';
                  return (
                    <tr key={a.publicId} className={selected.has(a.publicId) ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${a.publicId} сонгох`}
                          checked={selected.has(a.publicId)}
                          onChange={() => toggle(a.publicId)}
                        />
                      </td>
                      <td className="mono">{a.publicId}</td>
                      <td>
                        {a.country} · {a.visaCode}
                      </td>
                      <td>{fmtDate(a.submittedAt)}</td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td>{a.operatorName || <span className="muted">—</span>}</td>
                      <td>
                        <select
                          aria-label="Оператор"
                          value={sel}
                          onChange={(e) => setPick({ ...pick, [a.publicId]: e.target.value })}
                          style={{ minHeight: 38, padding: '6px 10px' }}
                        >
                          <option value="">— сонгох —</option>
                          {data.operators
                            .filter((o) => o.id !== a.operatorId)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} ({o.openCount})
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="row-actions">
                        <Button className="btn-sm" disabled={!sel} onClick={() => setPending({ item: a, to: Number(sel) })}>
                          {a.operatorId ? 'Дахин хуваарилах' : 'Хуваарилах'}
                        </Button>
                        {a.operatorId && (
                          <button className="btn-link danger" onClick={() => setPending({ item: a, to: null })}>
                            Цуцлах
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
      <Confirm
        open={bulkOpen}
        title="Олноор хуваарилах уу?"
        loading={busy}
        onClose={() => !busy && setBulkOpen(false)}
        onConfirm={applyBulk}
      >
        <p>
          Сонгосон <strong>{selected.size}</strong> мэдүүлгийг <strong>{opName(Number(bulkOp))}</strong>-д хуваарилна. Аль нэг нь өөр хүнээр
          өөрчлөгдсөн бол юу ч хадгалагдахгүй.
        </p>
      </Confirm>
      <Confirm
        open={!!pending}
        title={pending?.to ? 'Хуваарилалт баталгаажуулах' : 'Хуваарилалт цуцлах'}
        loading={busy}
        onClose={() => setPending(null)}
        onConfirm={apply}
        tone={pending?.to ? 'primary' : 'danger'}
      >
        {pending && (
          <p>
            <span className="mono">{pending.item.publicId}</span>
            <br />
            Өмнөх: <strong>{pending.item.operatorName || '—'}</strong> → Шинэ: <strong>{pending.to ? opName(pending.to) : '—'}</strong>
          </p>
        )}
      </Confirm>
    </Page>
  );
}
