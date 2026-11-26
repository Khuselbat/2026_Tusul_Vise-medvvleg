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
  TableWrap,
} from '../../components/ui.jsx';

// Зураг 60 Мэдүүлэг операторт хуваарилах — зөвхөн metadata
import { t } from '../../i18n.js';
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
        .map((a) => ({
          publicId: a.publicId,
          expectedOperatorId: a.operatorId ?? null,
        }));
      const r = await api.put('/api/admin/assignments', {
        operatorId: Number(bulkOp),
        items,
      });
      toast(
        t('{{v0}} мэдүүлэг хуваарилагдлаа.', {
          v0: r.assigned,
        }),
      );
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
      toast(pending.to ? t('Хуваарилагдлаа.') : t('Хуваарилалт цуцлагдлаа.'), pending.to ? 'ok' : 'info');
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
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Хуваарилалт'),
        },
      ]}
      title={t('Мэдүүлэг операторт хуваарилах')}
      subtitle={t('Идэвхтэй операторт хуваарилах, дахин хуваарилах, цуцлах')}
    >
      <div className="filters">
        <Field label={t('Харах')} htmlFor="f">
          <select
            id="f"
            value={filter}
            onChange={(e) => {
              setSelected(new Set());
              setSp({
                filter: e.target.value,
                ...(search
                  ? {
                      q: search,
                    }
                  : {}),
              });
            }}
          >
            <option value="unassigned">{t('Хуваарилаагүй')}</option>
            <option value="assigned">{t('Хуваарилсан')}</option>
            <option value="all">{t('Бүгд')}</option>
          </select>
        </Field>
        <form
          role="search"
          className="row-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setSelected(new Set());
            setSp({
              filter,
              ...(q.trim()
                ? {
                    q: q.trim(),
                  }
                : {}),
            });
          }}
        >
          <Field label={t('Лавлах дугаар')} htmlFor="aq">
            <input id="aq" type="search" value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Button type="submit" variant="ghost">
            {t('Хайх')}
          </Button>
        </form>
        {data && (
          <div
            className="small muted"
            style={{
              paddingBottom: 10,
            }}
          >
            {t('Операторын ачаалал:')} {data.operators.map((o) => `${o.name} (${o.openCount})`).join(' · ') || t('идэвхтэй оператор алга')}
          </div>
        )}
      </div>
      {conflict && (
        <Alert tone="warn">
          {conflict} {t('Жагсаалтыг дахин уншлаа.')}
        </Alert>
      )}
      {selected.size > 0 && data && (
        <div className="bulk-bar" role="region" aria-label={t('Олноор хуваарилах')}>
          <strong>
            {selected.size} {t('сонгосон')}
          </strong>
          <select aria-label={t('Хуваарилах оператор')} value={bulkOp} onChange={(e) => setBulkOp(e.target.value)}>
            <option value="">{t('— оператор сонгох —')}</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.openCount})
              </option>
            ))}
          </select>
          <Button className="btn-sm" disabled={!bulkOp} onClick={() => setBulkOpen(true)}>
            {t('Сонгосныг хуваарилах')}
          </Button>
          <Button className="btn-sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t('Сонголт арилгах')}
          </Button>
        </div>
      )}
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={filter === 'unassigned' ? t('Хуваарилаагүй мэдүүлэг алга') : t('Мэдүүлэг алга')} />
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label={t('Бүгдийг сонгох')}
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((a) => a.publicId)))}
                    />
                  </th>
                  <th>{t('Лавлах дугаар')}</th>
                  <th>{t('Улс · төрөл')}</th>
                  <th>{t('Илгээсэн')}</th>
                  <th>{t('Төлөв')}</th>
                  <th>{t('Одоогийн оператор')}</th>
                  <th>{t('Оператор сонгох')}</th>
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
                          aria-label={t('{{v0}} сонгох', {
                            v0: a.publicId,
                          })}
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
                          aria-label={t('Оператор')}
                          value={sel}
                          onChange={(e) =>
                            setPick({
                              ...pick,
                              [a.publicId]: e.target.value,
                            })
                          }
                          style={{
                            minHeight: 38,
                            padding: '6px 10px',
                          }}
                        >
                          <option value="">{t('— сонгох —')}</option>
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
                        <Button
                          className="btn-sm"
                          disabled={!sel}
                          onClick={() =>
                            setPending({
                              item: a,
                              to: Number(sel),
                            })
                          }
                        >
                          {a.operatorId ? t('Дахин хуваарилах') : t('Хуваарилах')}
                        </Button>
                        {a.operatorId && (
                          <button
                            className="btn-link danger"
                            onClick={() =>
                              setPending({
                                item: a,
                                to: null,
                              })
                            }
                          >
                            {t('Цуцлах')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
      <Confirm
        open={bulkOpen}
        title={t('Олноор хуваарилах уу?')}
        loading={busy}
        onClose={() => !busy && setBulkOpen(false)}
        onConfirm={applyBulk}
      >
        <p>
          {t('Сонгосон')} <strong>{selected.size}</strong> {t('мэдүүлгийг')} <strong>{opName(Number(bulkOp))}</strong>
          {t('-д хуваарилна. Аль нэг нь өөр хүнээр өөрчлөгдсөн бол юу ч хадгалагдахгүй.')}
        </p>
      </Confirm>
      <Confirm
        open={!!pending}
        title={pending?.to ? t('Хуваарилалт баталгаажуулах') : t('Хуваарилалт цуцлах')}
        loading={busy}
        onClose={() => setPending(null)}
        onConfirm={apply}
        tone={pending?.to ? 'primary' : 'danger'}
      >
        {pending && (
          <p>
            <span className="mono">{pending.item.publicId}</span>
            <br />
            {t('Өмнөх:')} <strong>{pending.item.operatorName || '—'}</strong> {t('→ Шинэ:')}{' '}
            <strong>{pending.to ? opName(pending.to) : '—'}</strong>
          </p>
        )}
      </Confirm>
    </Page>
  );
}
