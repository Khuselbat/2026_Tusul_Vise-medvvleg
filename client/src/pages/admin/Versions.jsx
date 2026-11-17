import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import {
  Page,
  useAsync,
  ErrorBox,
  Skeleton,
  Empty,
  Badge,
  Button,
  LinkButton,
  useToast,
  fmtDate,
  fmtDateTime,
} from '../../components/ui.jsx';

export default function Versions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/visa-types/${id}/versions`), [id]);
  const [busy, setBusy] = useState(null);

  async function copy(v) {
    setBusy(v.id);
    try {
      const r = await api.post(`/api/admin/visa-types/${id}/versions`, { copyFromVersionId: v.id });
      toast(`v${r.versionNo} ноорог үүслээ.`);
      navigate(`/admin/versions/${r.id}`);
    } catch (ex) {
      toast(ex.message, 'danger');
    } finally {
      setBusy(null);
    }
  }

  const t = data?.visaType;
  return (
    <Page
      crumb={[{ label: 'Админ', to: '/admin' }, { label: 'Визийн төрөл', to: '/admin/visa-types' }, { label: t?.code || '…' }]}
      title={`Мэдээллийн хувилбарууд${t ? ` · ${t.code}` : ''}`}
      subtitle={t && `${t.country.name} · нийтэлсэн хувилбарыг засахгүй — хуулж шинэ хувилбар үүсгэнэ`}
      actions={<LinkButton to={`/admin/visa-types/${id}/versions/new`}>Шинэ хувилбар</LinkButton>}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.versions.length === 0 ? (
          <Empty title="Хувилбар алга" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Нэр</th>
                  <th>Төлөв</th>
                  <th>Шалгасан</th>
                  <th>Шаардлага</th>
                  <th>Мэдүүлэг</th>
                  <th>Үүсгэсэн</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.versionNo}</td>
                    <td>{v.nameMn}</td>
                    <td>
                      {v.publishedAt ? <Badge tone="ok">Нийтэлсэн {fmtDate(v.publishedAt)}</Badge> : <Badge tone="muted">Ноорог</Badge>}
                    </td>
                    <td>{fmtDate(v.verifiedAt)}</td>
                    <td>{v.requirementCount}</td>
                    <td>{v.applicationCount}</td>
                    <td className="small">
                      {v.createdBy}
                      <br />
                      <span className="muted">{fmtDateTime(v.createdAt)}</span>
                    </td>
                    <td className="row-actions">
                      <Link to={`/admin/versions/${v.id}`}>{v.publishedAt ? 'Үзэх' : 'Засах'}</Link>
                      <Link to={`/admin/versions/${v.id}/requirements`}>Шаардлага</Link>
                      <Button variant="ghost" className="btn-sm" loading={busy === v.id} onClick={() => copy(v)}>
                        Хуулж шинэ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </Page>
  );
}
