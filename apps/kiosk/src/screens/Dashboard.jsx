import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { REQUEST_STATUSES, STATUS_LABEL_KEYS, formatDate } from '@dhofar/shared';

import { api } from '../api/client.js';
import { useErrorMessage, useI18n, useLocalizedName } from '../i18n/index.js';
import {
  EmptyState,
  ErrorPanel,
  Screen,
  SelectField,
  Spinner,
  StatusBadge,
  TextField,
  TouchButton,
} from '../components/index.jsx';

const PAGE_SIZE = 5;

export default function Dashboard() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const localizedName = useLocalizedName();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['citizen-requests', { page, status, from, to }],
    queryFn: async () => {
      const result = await api.listMyRequests({ page, pageSize: PAGE_SIZE, status, from, to });
      return result;
    },
    // Citizen data must not linger in the cache on a shared terminal.
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  const requests = query.data?.data?.requests ?? [];
  const pagination = query.data?.meta?.pagination;

  const clearFilters = () => {
    setStatus('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <Screen
      title={t('dashboard.heading')}
      actions={
        <TouchButton onClick={() => navigate('/new')}>{t('dashboard.newRequest')}</TouchButton>
      }
    >
      <div className="row" style={{ marginBottom: 'var(--sp-4)', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <SelectField
            label={t('dashboard.filterStatus')}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: '', label: t('dashboard.filterAll') },
              ...REQUEST_STATUSES.map((value) => ({ value, label: t(STATUS_LABEL_KEYS[value]) })),
            ]}
          />
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <TextField
            label={t('dashboard.filterFrom')}
            type="date"
            value={from}
            onChange={(value) => {
              setFrom(value);
              setPage(1);
            }}
          />
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <TextField
            label={t('dashboard.filterTo')}
            type="date"
            value={to}
            onChange={(value) => {
              setTo(value);
              setPage(1);
            }}
          />
        </div>
        <TouchButton variant="ghost" size="normal" onClick={clearFilters}>
          {t('dashboard.clearFilters')}
        </TouchButton>
      </div>

      {query.isPending && <Spinner />}
      {query.isError && <ErrorPanel message={toMessage(query.error)} onRetry={query.refetch} />}

      {query.isSuccess && requests.length === 0 && (
        <EmptyState
          title={t('dashboard.empty')}
          hint={t('dashboard.emptyHint')}
          action={
            <TouchButton onClick={() => navigate('/new')} style={{ marginTop: 'var(--sp-3)' }}>
              {t('dashboard.newRequest')}
            </TouchButton>
          }
        />
      )}

      {query.isSuccess && requests.length > 0 && (
        <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {requests.map((request) => (
            <li key={request.referenceNumber}>
              <article className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0 }}>{request.title}</h2>
                  <StatusBadge status={request.status} labelKey={STATUS_LABEL_KEYS[request.status]} />
                </div>
                <div className="card__meta">
                  <span>
                    {t('dashboard.reference')}: <span className="reference" style={{ fontSize: 'var(--fs-sm)' }}>{request.referenceNumber}</span>
                  </span>
                  <span>{localizedName(request.service)}</span>
                  <span>
                    {t('dashboard.submitted')}: {formatDate(request.createdAt, locale)}
                  </span>
                  <span>
                    {t('dashboard.updated')}: {formatDate(request.updatedAt, locale)}
                  </span>
                </div>
                <TouchButton
                  size="normal"
                  variant="secondary"
                  onClick={() => navigate(`/requests/${request.referenceNumber}`)}
                >
                  {t('dashboard.view')}
                </TouchButton>
              </article>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav className="row" style={{ marginTop: 'var(--sp-4)', justifyContent: 'center' }} aria-label={t('common.page')}>
          <TouchButton
            size="normal"
            variant="ghost"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={!pagination.hasPreviousPage}
          >
            {t('common.previous')}
          </TouchButton>
          <span aria-live="polite">
            {t('common.page')} {pagination.page} {t('common.of')} {pagination.totalPages}
          </span>
          <TouchButton
            size="normal"
            variant="ghost"
            onClick={() => setPage((value) => value + 1)}
            disabled={!pagination.hasNextPage}
          >
            {t('common.next')}
          </TouchButton>
        </nav>
      )}
    </Screen>
  );
}
