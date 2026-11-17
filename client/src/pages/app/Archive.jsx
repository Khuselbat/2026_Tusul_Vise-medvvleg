import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Page, useAsync, ErrorBox, Skeleton, Empty, Badge, Button, LinkButton, Field, Pagination, fmtDate } from '../../components/ui.jsx';

// Зураг 47 Миний мэдүүлгийн архив — огноо, төрөл, бүрдлийн төлөвөөр шүүнэ (серверийн шүүлт)
import { t } from '../../i18n.js';
export default function Archive() {
  const [sp, setSp] = useSearchParams();
  const params = {
    status: sp.get('status') || '',
    visaTypeId: sp.get('visaTypeId') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    q: sp.get('q') || '',
    page: sp.get('page') || '1',
  };
  const { data, error, loading, reload } = useAsync(() => api.get(`/api/app/applications${qs(params)}`), [sp.toString()]);
  const set = (k) => (e) => {
    const n = new URLSearchParams(sp);
    if (e.target.value) n.set(k, e.target.value);
    else n.delete(k);
    n.delete('page');
    setSp(n);
  };
  const filtered = ['status', 'visaTypeId', 'from', 'to', 'q'].some((k) => sp.get(k));
  return (
    <Page
      crumb={[
        {
          label: t('Мэдүүлэгч'),
          to: '/app',
        },
        {
          label: t('Архив'),
        },
      ]}
      title={t('Миний мэдүүлгийн архив')}
      subtitle={t('Илгээсэн бүх мэдүүлэг, анкет, хавсралт')}
      actions={
        <>
          <LinkButton variant="ghost" to="/app/imports">
            {t('Өмнөх (импортолсон) мэдүүлэг')}
          </LinkButton>
          <LinkButton to="/app/new">{t('Шинэ мэдүүлэг')}</LinkButton>
        </>
      }
    >
      <div className="filters">
        <Field label={t('Лавлах дугаар')} htmlFor="q">
          <input id="q" value={params.q} onChange={set('q')} placeholder="KR-…" />
        </Field>
        <Field label={t('Төлөв')} htmlFor="st">
          <select id="st" value={params.status} onChange={set('status')}>
            <option value="">{t('Бүгд')}</option>
            <option value="SUBMITTED">{t('Илгээсэн')}</option>
            <option value="IN_REVIEW">{t('Бүрдэл хянаж байна')}</option>
            <option value="INCOMPLETE">{t('Нэмэлт материал шаардсан')}</option>
            <option value="COMPLETE">{t('Бүрдэл бүрэн')}</option>
          </select>
        </Field>
        <Field label={t('Визийн төрөл')} htmlFor="vt">
          <select id="vt" value={params.visaTypeId} onChange={set('visaTypeId')}>
            <option value="">{t('Бүгд')}</option>
            {data?.visaTypes.map((tv) => (
              <option key={tv.id} value={tv.id}>
                {tv.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Эхлэх огноо')} htmlFor="from">
          <input id="from" type="date" value={params.from} onChange={set('from')} />
        </Field>
        <Field label={t('Дуусах огноо')} htmlFor="to">
          <input id="to" type="date" value={params.to} onChange={set('to')} />
        </Field>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Skeleton rows={4} />
      ) : (
        data &&
        (data.items.length === 0 ? (
          filtered ? (
            <Empty
              title={t('Шүүлтэд тохирох мэдүүлэг олдсонгүй')}
              action={
                <Button variant="ghost" onClick={() => setSp({})}>
                  {t('Шүүлт цэвэрлэх')}
                </Button>
              }
            />
          ) : (
            <Empty title={t('Архив хоосон байна')} action={<LinkButton to="/app/new">{t('Шинэ мэдүүлэг')}</LinkButton>}>
              {t('Илгээсэн мэдүүлэг энд хадгалагдана.')}
            </Empty>
          )
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('Лавлах дугаар')}</th>
                    <th>{t('Улс · төрөл')}</th>
                    <th>{t('Илгээсэн огноо')}</th>
                    <th>{t('Бүрдлийн төлөв')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.publicId}>
                      <td className="mono">{a.publicId}</td>
                      <td>
                        {a.country} · {a.visaCode}
                        <div className="small muted">{a.visaName}</div>
                      </td>
                      <td>{fmtDate(a.submittedAt)}</td>
                      <td>
                        <Badge status={a.status} />
                      </td>
                      <td>
                        <Link to={`/app/applications/${a.publicId}`}>{t('Дэлгэрэнгүй')}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(p) => {
                const n = new URLSearchParams(sp);
                n.set('page', p);
                setSp(n);
              }}
            />
          </>
        ))
      )}
    </Page>
  );
}
