import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import {
  Page,
  useAsync,
  ErrorBox,
  Skeleton,
  Empty,
  Field,
  Pagination,
  Modal,
  DL,
  Button,
  fmtDateTime,
  TableWrap,
} from '../../components/ui.jsx';
import { t } from '../../i18n.js';
const ACTION_MN = {
  LOGIN: t('Нэвтэрсэн'),
  LOGIN_FAILED: t('Нэвтрэх оролдлого амжилтгүй'),
  LOGOUT: t('Гарсан'),
  USER_REGISTER: t('Бүртгүүлсэн'),
  PROFILE_UPDATE: t('Профайл зассан'),
  PASSWORD_CHANGE: t('Нууц үг солисон'),
  DRAFT_CREATE: t('Ноорог үүсгэсэн'),
  DRAFT_FORM_SAVE: t('Анкет хадгалсан'),
  DRAFT_DELETE: t('Ноорог цуцалсан'),
  DOC_UPLOAD: t('Файл хавсаргасан'),
  DOC_DELETE: t('Файл арилгасан'),
  APP_SUBMIT: t('Мэдүүлэг илгээсэн'),
  APP_VIEW: t('Мэдүүлэг үзсэн'),
  APP_ACCESS_DENIED: t('Хандалт хориглогдсон'),
  FILE_VIEW: t('Файл үзсэн'),
  FILE_DOWNLOAD: t('Файл татсан'),
  FILE_DENIED: t('Файлд хандах эрхгүй'),
  REVIEW_CREATE: t('Бүрдлийн үнэлгээ'),
  SUPPLEMENT_CREATE: t('Нэмэлт багц эхлүүлсэн'),
  SUPPLEMENT_NOTE: t('Нэмэлт багцын тайлбар'),
  SUPPLEMENT_DOC_UPLOAD: t('Нэмэлт файл хавсаргасан'),
  SUPPLEMENT_DOC_DELETE: t('Нэмэлт файл арилгасан'),
  SUPPLEMENT_CANCEL: t('Нэмэлт багц цуцалсан'),
  SUPPLEMENT_SUBMIT: t('Нэмэлт материал илгээсэн'),
  HANDOVER_RECORD: t('Хүргүүлсэн гэж бүртгэсэн'),
  OFFICIAL_RESULT_RECORD: t('Албан үр дүн бүртгэсэн (мэдүүлэгч)'),
  OFFICIAL_RESULT_VERIFY: t('Албан үр дүнг тулгасан'),
  IMPORT_CREATE: t('Өмнөх мэдүүлэг нэмсэн'),
  IMPORT_VIEW: t('Өмнөх мэдүүлэг үзсэн'),
  IMPORT_DELETE: t('Өмнөх мэдүүлэг устгасан'),
  ADMIN_BOOTSTRAP: t('Анхны админ үүсгэсэн'),
  LOGIN_MFA_CHALLENGE: t('Нууц үг зөв — 2FA хүлээж байна'),
  MFA_ENABLE: t('2FA идэвхжүүлсэн'),
  MFA_RECOVERY_USED: t('Нөөц кодоор нэвтэрсэн'),
  MFA_RESET: t('2FA дахин тохируулсан'),
  EMAIL_VERIFY: t('Имэйл баталгаажуулсан'),
  EMAIL_VERIFY_RESEND: t('Баталгаажуулах холбоос дахин илгээсэн'),
  PASSWORD_RESET_REQUEST: t('Нууц үг сэргээх хүсэлт'),
  PASSWORD_RESET: t('Нууц үг сэргээсэн'),
  SESSION_REVOKE: t('Сесс хаасан'),
  SESSION_REVOKE_ALL: t('Бүх төхөөрөмжөөс гарсан'),
  FILE_REJECTED: t('Вирус илэрсэн файл устгасан'),
  RETENTION_RUN: t('Хадгалах хугацааны цэвэрлэгээ'),
  DATA_EXPORT: t('Мэдээллээ татсан (ZIP)'),
  DELETION_REQUEST: t('Бүртгэл устгах хүсэлт'),
  DELETION_CANCEL: t('Устгах хүсэлт цуцалсан'),
  DELETION_REJECT: t('Устгах хүсэлт татгалзсан'),
  ACCOUNT_ERASE: t('Бүртгэл устгасан'),
  APP_SUMMARY_PDF: t('PDF хураангуй татсан'),
  APP_ASSIGN: t('Хуваарилсан'),
  APP_REASSIGN: t('Дахин хуваарилсан'),
  APP_UNASSIGN: t('Хуваарилалт цуцалсан'),
  COUNTRY_CREATE: t('Улс нэмсэн'),
  COUNTRY_UPDATE: t('Улс зассан'),
  COUNTRY_DELETE: t('Улс устгасан'),
  VISA_TYPE_CREATE: t('Визийн төрөл нэмсэн'),
  VISA_TYPE_UPDATE: t('Визийн төрөл зассан'),
  VERSION_CREATE: t('Хувилбар үүсгэсэн'),
  VERSION_UPDATE: t('Хувилбар зассан'),
  VERSION_PUBLISH: t('Хувилбар нийтэлсэн'),
  VERSION_DELETE: t('Хувилбар устгасан'),
  REQUIREMENT_CREATE: t('Шаардлага нэмсэн'),
  REQUIREMENT_UPDATE: t('Шаардлага зассан'),
  REQUIREMENT_DELETE: t('Шаардлага устгасан'),
  STAFF_CREATE: t('Ажилтан бүртгэсэн'),
  USER_ACTIVATE: t('Хэрэглэгч идэвхжүүлсэн'),
  USER_DEACTIVATE: t('Хэрэглэгч хаасан'),
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
      crumb={[
        {
          label: t('Админ'),
          to: '/admin',
        },
        {
          label: t('Үйлдлийн бүртгэл'),
        },
      ]}
      title={t('Үйлдлийн бүртгэл')}
      subtitle={t('Хэн, хэзээ, ямар үйлдэл хийсэн (зөвхөн унших)')}
    >
      <div className="filters">
        <Field label={t('Эхлэх')} htmlFor="f">
          <input id="f" type="date" value={p.from} onChange={set('from')} />
        </Field>
        <Field label={t('Дуусах')} htmlFor="t">
          <input id="t" type="date" value={p.to} onChange={set('to')} />
        </Field>
        <Field label={t('Үйлдэл')} htmlFor="a">
          <select id="a" value={p.action} onChange={set('action')}>
            <option value="">{t('Бүгд')}</option>
            {data?.actions.map((x) => (
              <option key={x} value={x}>
                {ACTION_MN[x] || x}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Ажилтан (имэйл)')} htmlFor="ac">
          <input id="ac" value={p.actor} onChange={set('actor')} />
        </Field>
        {sp.toString() && (
          <Button variant="ghost" onClick={() => setSp({})}>
            {t('Цэвэрлэх')}
          </Button>
        )}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton />
      ) : (
        data &&
        (data.items.length === 0 ? (
          <Empty title={t('Бүртгэл алга')} />
        ) : (
          <>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>{t('Огноо')}</th>
                    <th>{t('Үйлдэл')}</th>
                    <th>{t('Объект')}</th>
                    <th>{t('Гүйцэтгэгч')}</th>
                    <th>{t('Мэдүүлэг')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr
                      key={e.id}
                      style={{
                        cursor: 'pointer',
                      }}
                      onClick={() => setRow(e)}
                      tabIndex={0}
                      onKeyDown={(k) => k.key === 'Enter' && setRow(e)}
                    >
                      <td className="small">{fmtDateTime(e.occurredAt)}</td>
                      <td className="small">
                        {ACTION_MN[e.action] || e.action}
                        <div
                          className="mono muted"
                          style={{
                            fontSize: 11,
                          }}
                        >
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
            </TableWrap>
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
      <Modal open={!!row} title={t('Бүртгэлийн мөр')} onClose={() => setRow(null)}>
        {row && (
          <DL
            items={[
              [t('Үйлдэл'), `${ACTION_MN[row.action] || ''} (${row.action})`],
              ['entity_type', row.entityType],
              ['entity_key', row.entityKey],
              [
                'request_id',
                <span key="rid" className="mono small">
                  {row.requestId}
                </span>,
              ],
              [t('Гүйцэтгэгч'), row.actor],
              [t('Огноо'), fmtDateTime(row.occurredAt)],
              [t('Мэдүүлэг'), row.applicationRef],
            ]}
          />
        )}
      </Modal>
    </Page>
  );
}
