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
  Field,
  Confirm,
  Alert,
  useToast,
  fmtDateTime,
  TableWrap,
} from '../../components/ui.jsx';
import { t } from '../../i18n.js';
const TABS = [
  ['PENDING', t('Хүлээгдэж буй')],
  ['APPROVED', t('Устгасан')],
  ['REJECTED', t('Татгалзсан')],
  ['CANCELLED', t('Цуцалсан')],
];

// Үе 3 — бүртгэл устгах хүсэлт (тайлан 4.5). Админ хувийн агуулга харахгүй; зөвхөн хүсэлтийн мэдээлэл.
export default function DeletionRequests() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || 'PENDING';
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/admin/deletion-requests?status=${status}`), [status]);
  const [action, setAction] = useState(null); // { item, kind }
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/admin/deletion-requests/${action.item.id}/${action.kind}`, {
        note,
      });
      toast(
        action.kind === 'approve'
          ? t('Бүртгэл устгагдлаа ({{v0}} файл).', {
              v0: r.files,
            })
          : t('Хүсэлтийг татгалзлаа.'),
      );
      setAction(null);
      reload();
    } catch (ex) {
      setErr(ex.fields?.note || ex.message);
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
          label: t('Устгах хүсэлт'),
        },
      ]}
      title={t('Бүртгэл устгах хүсэлт')}
      subtitle={t('Мэдүүлэгчийн хувийн мэдээллийг устгах хүсэлтийг шийдвэрлэнэ')}
    >
      <div className="row-actions" role="tablist">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={k === status}
            className={`btn ${k === status ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() =>
              setSp({
                status: k,
              })
            }
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={3} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={t('Хүсэлт алга')} />
        ) : (
          <TableWrap className="mt">
            <table>
              <thead>
                <tr>
                  <th>{t('Хэрэглэгч')}</th>
                  <th>{t('Хүссэн')}</th>
                  <th>{t('Шалтгаан')}</th>
                  <th>{t('Мэдүүлэг')}</th>
                  <th>{status === 'PENDING' ? '' : t('Шийдвэр')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.name}
                      <div className="small muted">{x.email}</div>
                    </td>
                    <td>{fmtDateTime(x.requestedAt)}</td>
                    <td className="small">{x.reason || '—'}</td>
                    <td>
                      {x.applications}
                      {x.activeApplications > 0 && (
                        <Badge tone="warn">
                          {x.activeApplications} {t('хянагдаж буй')}
                        </Badge>
                      )}
                    </td>
                    <td className="row-actions">
                      {status === 'PENDING' ? (
                        <>
                          <button
                            className="btn-link danger"
                            disabled={x.activeApplications > 0}
                            title={x.activeApplications > 0 ? t('Хянагдаж буй мэдүүлэг дууссаны дараа') : undefined}
                            onClick={() => {
                              setAction({
                                item: x,
                                kind: 'approve',
                              });
                              setNote('');
                              setErr('');
                            }}
                          >
                            {t('Баталгаажуулж устгах')}
                          </button>
                          <button
                            className="btn-link"
                            onClick={() => {
                              setAction({
                                item: x,
                                kind: 'reject',
                              });
                              setNote('');
                              setErr('');
                            }}
                          >
                            {t('Татгалзах')}
                          </button>
                        </>
                      ) : (
                        <span className="small">
                          {x.decidedBy || '—'} · {fmtDateTime(x.decidedAt)}
                          {x.decisionNote && <div className="muted">{x.decisionNote}</div>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))
      )}
      <Confirm
        open={!!action}
        title={action?.kind === 'approve' ? t('Бүртгэлийг бүрмөсөн устгах уу?') : t('Хүсэлтийг татгалзах уу?')}
        tone={action?.kind === 'approve' ? 'danger' : 'primary'}
        confirmLabel={action?.kind === 'approve' ? t('Устгах') : t('Татгалзах')}
        loading={busy}
        onClose={() => !busy && setAction(null)}
        onConfirm={apply}
      >
        {action?.kind === 'approve' && (
          <Alert tone="danger">
            <strong>{action.item.email}</strong>
            {t('-ийн анкет, бүх хавсралт, импорт, мэдэгдэл бүрмөсөн устаж, бүртгэл нэргүй болно. Буцаах боломжгүй.')}
          </Alert>
        )}
        <Field
          label={action?.kind === 'reject' ? t('Татгалзсан шалтгаан') : t('Тэмдэглэл (сонголттой)')}
          htmlFor="dr-note"
          error={err}
          required={action?.kind === 'reject'}
        >
          <textarea id="dr-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Confirm>
    </Page>
  );
}
