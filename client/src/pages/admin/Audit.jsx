import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Field, Pagination, Modal, DL, Button, fmtDateTime } from '../../components/ui.jsx';

const ACTION_MN = {
  LOGIN: 'Нэвтэрсэн',
  LOGIN_FAILED: 'Нэвтрэх оролдлого амжилтгүй',
  LOGOUT: 'Гарсан',
  USER_REGISTER: 'Бүртгүүлсэн',
  PROFILE_UPDATE: 'Профайл зассан',
  PASSWORD_CHANGE: 'Нууц үг солисон',
  DRAFT_CREATE: 'Ноорог үүсгэсэн',
  DRAFT_FORM_SAVE: 'Анкет хадгалсан',
  DRAFT_DELETE: 'Ноорог цуцалсан',
  DOC_UPLOAD: 'Файл хавсаргасан',
  DOC_DELETE: 'Файл арилгасан',
  APP_SUBMIT: 'Мэдүүлэг илгээсэн',
  APP_VIEW: 'Мэдүүлэг үзсэн',
  APP_ACCESS_DENIED: 'Хандалт хориглогдсон',
  FILE_VIEW: 'Файл үзсэн',
  FILE_DOWNLOAD: 'Файл татсан',
  FILE_DENIED: 'Файлд хандах эрхгүй',
  REVIEW_CREATE: 'Бүрдлийн үнэлгээ',
  APP_ASSIGN: 'Хуваарилсан',
  APP_REASSIGN: 'Дахин хуваарилсан',
  APP_UNASSIGN: 'Хуваарилалт цуцалсан',
  COUNTRY_CREATE: 'Улс нэмсэн',
  COUNTRY_UPDATE: 'Улс зассан',
  COUNTRY_DELETE: 'Улс устгасан',
  VISA_TYPE_CREATE: 'Визийн төрөл нэмсэн',
  VISA_TYPE_UPDATE: 'Визийн төрөл зассан',
  VERSION_CREATE: 'Хувилбар үүсгэсэн',
  VERSION_UPDATE: 'Хувилбар зассан',
  VERSION_PUBLISH: 'Хувилбар нийтэлсэн',
  VERSION_DELETE: 'Хувилбар устгасан',
  REQUIREMENT_CREATE: 'Шаардлага нэмсэн',
  REQUIREMENT_UPDATE: 'Шаардлага зассан',
  REQUIREMENT_DELETE: 'Шаардлага устгасан',
  STAFF_CREATE: 'Ажилтан бүртгэсэн',
  USER_ACTIVATE: 'Хэрэглэгч идэвхжүүлсэн',
  USER_DEACTIVATE: 'Хэрэглэгч хаасан',
};

// Зураг 61 Үйлдлийн бүртгэл — засах/устгах товчгүй; нууц мэдээлэл харуулахгүй
export default function Audit() {
  const [sp, setSp] = useSearchParams();
  const p = {
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    action: sp.get('action') || '',
    actor: sp.get('actor') || '',
    page: sp.get('page') || '1',
  };
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/audit${qs(p)}`), [sp.toString()]);
  const [row, setRow] = useState(null);
  const set = (k) => (e) => {
    const n = new URLSearchParams(sp);
    if (e.target.value) n.set(k, e.target.value);
    else n.delete(k);
    n.delete('page');
    setSp(n);
  };

  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Үйлдлийн бүртгэл' }]}
      title="Үйлдлийн бүртгэл"
      subtitle="Хэн, хэзээ, ямар үйлдэл хийсэн (зөвхөн унших)"
    >
      <div className="filters">
        <Field label="Эхлэх" htmlFor="f">
          <input id="f" type="date" value={p.from} onChange={set('from')} />
        </Field>
        <Field label="Дуусах" htmlFor="t">
          <input id="t" type="date" value={p.to} onChange={set('to')} />
        </Field>
        <Field label="Үйлдэл" htmlFor="a">
          <select id="a" value={p.action} onChange={set('action')}>
            <option value="">Бүгд</option>
            {data?.actions.map((x) => (
              <option key={x} value={x}>
                {ACTION_MN[x] || x}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ажилтан (имэйл)" htmlFor="ac">
          <input id="ac" value={p.actor} onChange={set('actor')} />
        </Field>
        {sp.toString() && (
          <Button variant="ghost" onClick={() => setSp({})}>
            Цэвэрлэх
          </Button>
        )}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title="Бүртгэл алга" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Огноо</th>
                    <th>Үйлдэл</th>
                    <th>Объект</th>
                    <th>Гүйцэтгэгч</th>
                    <th>Мэдүүлэг</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr
                      key={e.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setRow(e)}
                      tabIndex={0}
                      onKeyDown={(k) => k.key === 'Enter' && setRow(e)}
                    >
                      <td className="small">{fmtDateTime(e.occurredAt)}</td>
                      <td className="small">
                        {ACTION_MN[e.action] || e.action}
                        <div className="mono muted" style={{ fontSize: 11 }}>
                          {e.action}
                        </div>
                      </td>
                      <td className="small">
                        {e.entityType}
                        {e.entityKey ? ` · ${e.entityKey}` : ''}
                      </td>
                      <td className="small">{e.actor}</td>
                      <td className="mono small">{e.applicationRef || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(n) => {
                const x = new URLSearchParams(sp);
                x.set('page', n);
                setSp(x);
              }}
            />
          </>
        ))
      )}
      <Modal open={!!row} title="Бүртгэлийн мөр" onClose={() => setRow(null)}>
        {row && (
          <DL
            items={[
              ['Үйлдэл', `${ACTION_MN[row.action] || ''} (${row.action})`],
              ['entity_type', row.entityType],
              ['entity_key', row.entityKey],
              [
                'request_id',
                <span key="rid" className="mono small">
                  {row.requestId}
                </span>,
              ],
              ['Гүйцэтгэгч', row.actor],
              ['Огноо', fmtDateTime(row.occurredAt)],
              ['Мэдүүлэг', row.applicationRef],
            ]}
          />
        )}
      </Modal>
    </Page>
  );
}
