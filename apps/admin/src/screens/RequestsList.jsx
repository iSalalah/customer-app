import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { REQUEST_STATUSES, SCOPE, formatDate } from '@dhofar/shared';

import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useErrorMessage, useI18n, useLocalizedName } from '../i18n/index.js';
import {
  Button,
  EmptyState,
  ErrorPanel,
  Pagination,
  SelectField,
  Spinner,
  StatusBadge,
  TextField,
} from '../components/index.jsx';

const PAGE_SIZE = 20;

const EMPTY_FILTERS = { status: '', assignedTo: '', serviceId: '', from: '', to: '', q: '' };

/**
 * Request queue.
 *
 * The filter set adapts to the caller's role, but only as a convenience: an
 * employee sees no assignee filter because every row is already theirs, and a
 * section head sees no department filter because they have exactly one. The API
 * intersects whatever arrives with the caller's scope regardless.
 */
export default function RequestsList() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { staff, permissions } = useAuth();
  const toMessage = useErrorMessage();
  const localizedName = useLocalizedName();

  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);

  const query = useQuery({
    queryKey: ['staff-requests', { page, ...applied }],
    queryFn: () => api.listRequests({ page, pageSize: PAGE_SIZE, ...applied }),
    retry: false,
  });

  const requests = query.data?.data?.requests ?? [];
  const pagination = query.data?.meta?.pagination;

  const apply = (event) => {
    event.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{t('list.heading')}</h1>
        <span className="panel" style={{ fontSize: 'var(--fs-xs)' }}>
          {t(`scope.${permissions?.scope ?? SCOPE.OWN}`)}
          {staff?.department ? ` — ${localizedName(staff.department)}` : ''}
          {staff?.section ? ` / ${localizedName(staff.section)}` : ''}
        </span>
      </div>

      <form className="card" onSubmit={apply} aria-label={t('list.filters')}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ minWidth: 180, flex: 1 }}>
            <SelectField
              label={t('list.filterStatus')}
              value={draft.status}
              onChange={(value) => setDraft((current) => ({ ...current, status: value }))}
              options={[
                { value: '', label: t('common.all') },
                ...REQUEST_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
              ]}
            />
          </div>
          <div style={{ minWidth: 160, flex: 1 }}>
            <TextField
              label={t('list.filterFrom')}
              type="date"
              value={draft.from}
              onChange={(value) => setDraft((current) => ({ ...current, from: value }))}
            />
          </div>
          <div style={{ minWidth: 160, flex: 1 }}>
            <TextField
              label={t('list.filterTo')}
              type="date"
              value={draft.to}
              onChange={(value) => setDraft((current) => ({ ...current, to: value }))}
            />
          </div>
          <div style={{ minWidth: 220, flex: 2 }}>
            <TextField
              label={t('list.filterSearch')}
              value={draft.q}
              onChange={(value) => setDraft((current) => ({ ...current, q: value }))}
            />
          </div>
          <button type="submit" className="btn btn--primary">
            {t('common.apply')}
          </button>
          <Button variant="ghost" onClick={clear}>
            {t('common.clear')}
          </Button>
        </div>
      </form>

      {query.isPending && <Spinner />}
      {query.isError && <ErrorPanel message={toMessage(query.error)} onRetry={query.refetch} />}

      {query.isSuccess && requests.length === 0 && <EmptyState message={t('list.empty')} />}

      {query.isSuccess && requests.length > 0 && (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table className="table">
            <caption className="visually-hidden">{t('list.heading')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('list.reference')}</th>
                <th scope="col">{t('list.title')}</th>
                <th scope="col">{t('list.status')}</th>
                <th scope="col">{t('list.service')}</th>
                <th scope="col">{t('list.section')}</th>
                <th scope="col">{t('list.assignee')}</th>
                <th scope="col">{t('list.created')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('list.open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="reference">{request.referenceNumber}</td>
                  <td>{request.title}</td>
                  <td>
                    <StatusBadge status={request.status} />
                  </td>
                  <td>{localizedName(request.service)}</td>
                  <td>{request.section ? localizedName(request.section) : '—'}</td>
                  <td>{request.assignee ? localizedName(request.assignee) : t('common.unassigned')}</td>
                  <td>{formatDate(request.createdAt, locale)}</td>
                  <td>
                    <Button variant="secondary" onClick={() => navigate(`/requests/${request.id}`)}>
                      {t('list.open')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination pagination={pagination} onPage={setPage} />
    </>
  );
}
