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
  TableWrap,
} from '../../components/ui.jsx';
import { t } from '../../i18n.js';
export default function Versions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/visa-types/${id}/versions`), [id]);
  const [busy, setBusy] = useState(null);
  async function copy(v) {
    setBusy(v.id);
    try {
      const r = await api.post(`/api/admin/visa-types/${id}/versions`, {
        copyFromVersionId: v.id,
      });
      toast(
        t('v{{v0}} ноорог үүслээ.', {
          v0: r.versionNo,
        }),
      );
      navigate(`/admin/versions/${r.id}`);
    } catch (ex) {
      toast(ex.message, 'danger');
    } finally {
      setBusy(null);
    }
  }
  const tv = data?.visaType;
  return (
    <Page
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Визийн төрөл'),
          to: '/admin/visa-types',
        },
        {
          label: tv?.code || '…',
        },
      ]}
      title={t('Мэдээллийн хувилбарууд{{v0}}', {
        v0: tv ? ` · ${tv.code}` : '',
      })}
      subtitle={
        tv &&
        t('{{v0}} · нийтэлсэн хувилбарыг засахгүй — хуулж шинэ хувилбар үүсгэнэ', {
          v0: tv.country.name,
        })
      }
      actions={<LinkButton to={`/admin/visa-types/${id}/versions/new`}>{t('Шинэ хувилбар')}</LinkButton>}
    >
      <ErrorBox error={error} onRetry={reload} />
      {loading ? (
        <Skeleton />
      ) : (
        data &&
        (data.versions.length === 0 ? (
          <Empty title={t('Хувилбар алга')} />
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>{t('Нэр')}</th>
                  <th>{t('Төлөв')}</th>
                  <th>{t('Шалгасан')}</th>
                  <th>{t('Шаардлага')}</th>
                  <th>{t('Мэдүүлэг')}</th>
                  <th>{t('Үүсгэсэн')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.id}>
                    <td>v{v.versionNo}</td>
                    <td>{v.nameMn}</td>
                    <td>
                      {v.publishedAt ? (
                        <Badge tone="ok">
                          {t('Нийтэлсэн')} {fmtDate(v.publishedAt)}
                        </Badge>
                      ) : (
                        <Badge tone="muted">{t('Ноорог')}</Badge>
                      )}
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
                      <Link to={`/admin/versions/${v.id}`}>{v.publishedAt ? t('Үзэх') : t('Засах')}</Link>
                      <Link to={`/admin/versions/${v.id}/requirements`}>{t('Шаардлага')}</Link>
                      <Button variant="ghost" className="btn-sm" loading={busy === v.id} onClick={() => copy(v)}>
                        {t('Хуулж шинэ')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
    </Page>
  );
}
