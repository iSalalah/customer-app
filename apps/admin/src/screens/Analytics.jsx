import { useQuery } from '@tanstack/react-query';

import { REQUEST_STATUSES } from '@dhofar/shared';

import { api } from '../api/client.js';
import { useErrorMessage, useI18n, useLocalizedName } from '../i18n/index.js';
import { EmptyState, ErrorPanel, Spinner, StatCard, StatusBadge } from '../components/index.jsx';

function formatDuration(seconds, t) {
  if (seconds === null || seconds === undefined) return '—';
  const hours = seconds / 3600;
  if (hours >= 24) return `${(hours / 24).toFixed(1)} ${t('analytics.days')}`;
  return `${hours.toFixed(1)} ${t('analytics.hours')}`;
}

/**
 * Analytics.
 *
 * The API decides the scope from the caller's role; this screen just labels
 * whichever scope came back. There is no control here that could request a
 * different one, because no such parameter exists on the endpoint.
 */
export default function Analytics() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const localizedName = useLocalizedName();

  const query = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => api.analyticsSummary(),
    retry: false,
  });

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorPanel message={toMessage(query.error)} onRetry={query.refetch} />;

  const summary = query.data.data.summary;
  const maxStatusCount = Math.max(1, ...REQUEST_STATUSES.map((status) => summary.byStatus[status] ?? 0));

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('analytics.heading')}</h1>
        <span className="panel" style={{ fontSize: 'var(--fs-xs)' }}>
          {t(`scope.${summary.scope}`)}
        </span>
      </div>

      <div className="stats" style={{ marginBottom: 'var(--sp-3)' }}>
        <StatCard label={t('analytics.total')} value={summary.totals.total} />
        <StatCard label={t('analytics.open')} value={summary.totals.open} />
        <StatCard label={t('analytics.closed')} value={summary.totals.closed} />
        <StatCard
          label={t('analytics.avgClosure')}
          value={formatDuration(summary.totals.averageClosureSeconds, t)}
        />
      </div>

      <section className="card">
        <h2 className="card__title">{t('analytics.byStatus')}</h2>
        <table className="table">
          <caption className="visually-hidden">{t('analytics.byStatus')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('list.status')}</th>
              <th scope="col">{t('common.results')}</th>
              <th scope="col" style={{ width: '50%' }}>
                <span className="visually-hidden">%</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {REQUEST_STATUSES.map((status) => {
              const count = summary.byStatus[status] ?? 0;
              return (
                <tr key={status}>
                  <td>
                    <StatusBadge status={status} />
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</td>
                  <td>
                    {/* The bar is decorative; the number beside it carries the
                        information, so the chart is not the only source. */}
                    <div className="bar" aria-hidden="true">
                      <div className="bar__fill" style={{ width: `${(count / maxStatusCount) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="card__title">{t('analytics.topServices')}</h2>
        {summary.topServices.length === 0 ? (
          <EmptyState message={t('analytics.noData')} />
        ) : (
          <table className="table">
            <caption className="visually-hidden">{t('analytics.topServices')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('list.service')}</th>
                <th scope="col">{t('common.results')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.topServices.map((service) => (
                <tr key={service.serviceId}>
                  <td>{localizedName(service)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{service.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {summary.workload.length > 0 && (
        <section className="card">
          <h2 className="card__title">{t('analytics.workload')}</h2>
          <table className="table">
            <caption className="visually-hidden">{t('analytics.workload')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('list.assignee')}</th>
                <th scope="col">{t('common.results')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.workload.map((row) => (
                <tr key={row.staffId ?? 'unassigned'}>
                  <td>{row.unassigned ? t('common.unassigned') : localizedName(row)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
