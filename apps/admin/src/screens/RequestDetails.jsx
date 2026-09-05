import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import {
  LOG_ACTION_LABEL_KEYS,
  LOG_VISIBILITY,
  formatBytes,
  formatDateTime,
  isTerminalStatus,
} from '@dhofar/shared';

import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useErrorMessage, useI18n, useLocalizedName } from '../i18n/index.js';
import {
  Button,
  ErrorPanel,
  SelectField,
  Spinner,
  StatusBadge,
  TextArea,
} from '../components/index.jsx';

/**
 * Request detail and the three write panels.
 *
 * `allowedTransitions` comes from the API, computed from the same shared
 * transition matrix the API enforces. The dropdown therefore cannot offer an
 * option the server would reject - and if it somehow did, the server still says
 * no.
 */
export default function RequestDetails() {
  const { requestId } = useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { permissions } = useAuth();
  const toMessage = useErrorMessage();
  const localizedName = useLocalizedName();

  const [statusValue, setStatusValue] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [statusNoteVisibility, setStatusNoteVisibility] = useState(LOG_VISIBILITY.CITIZEN_VISIBLE);
  const [assignee, setAssignee] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteVisibility, setNoteVisibility] = useState(LOG_VISIBILITY.INTERNAL);

  const query = useQuery({
    queryKey: ['staff-request', requestId],
    queryFn: () => api.getRequest(requestId),
    retry: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-request', requestId] });
    queryClient.invalidateQueries({ queryKey: ['staff-requests'] });
  };

  const statusMutation = useMutation({
    mutationFn: () =>
      api.updateStatus(requestId, {
        status: statusValue,
        ...(statusNote.trim() ? { note: statusNote.trim(), noteVisibility: statusNoteVisibility } : {}),
      }),
    onSuccess: () => {
      setStatusValue('');
      setStatusNote('');
      invalidate();
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => api.updateAssignment(requestId, assignee === '' ? null : assignee),
    onSuccess: invalidate,
  });

  const noteMutation = useMutation({
    mutationFn: () => api.addNote(requestId, { message: noteText.trim(), visibility: noteVisibility }),
    onSuccess: () => {
      setNoteText('');
      invalidate();
    },
  });

  if (query.isPending) return <Spinner />;
  if (query.isError) {
    return (
      <>
        <ErrorPanel message={toMessage(query.error)} onRetry={query.refetch} />
        <Button variant="ghost" onClick={() => navigate('/requests')}>
          {t('common.back')}
        </Button>
      </>
    );
  }

  const request = query.data.data.request;
  const assignableStaff = query.data.data.assignableStaff ?? [];
  const terminal = isTerminalStatus(request.status);

  // A NEED_INFO move must reach the citizen, so the visibility control is locked
  // to CITIZEN_VISIBLE and a note becomes mandatory.
  const needsCitizenNote = statusValue === 'NEED_INFO';

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{request.title}</h1>
          <span className="reference">{request.referenceNumber}</span>
        </div>
        <div className="row">
          <StatusBadge status={request.status} />
          <Button variant="ghost" onClick={() => navigate('/requests')}>
            {t('common.back')}
          </Button>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <section className="card">
            <h2 className="card__title">{t('details.description')}</h2>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{request.description}</p>
            <dl className="row" style={{ marginTop: 'var(--sp-2)', gap: 'var(--sp-4)' }}>
              <div>
                <dt className="field__hint">{t('list.service')}</dt>
                <dd style={{ margin: 0 }}>{localizedName(request.service)}</dd>
              </div>
              <div>
                <dt className="field__hint">{t('list.section')}</dt>
                <dd style={{ margin: 0 }}>{request.section ? localizedName(request.section) : '—'}</dd>
              </div>
              <div>
                <dt className="field__hint">{t('details.phone')}</dt>
                <dd style={{ margin: 0 }} className="reference">
                  {request.citizen?.phoneMasked ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="field__hint">{t('list.created')}</dt>
                <dd style={{ margin: 0 }}>{formatDateTime(request.createdAt, locale)}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <h2 className="card__title">{t('details.attachments')}</h2>
            {request.attachments.length === 0 ? (
              <p style={{ color: 'var(--c-text-muted)', margin: 0 }}>{t('common.none')}</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {request.attachments.map((attachment) => (
                  <li key={attachment.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {attachment.fileName}
                      <span style={{ color: 'var(--c-text-muted)' }}> — {formatBytes(attachment.sizeBytes, locale)}</span>
                    </span>
                    <a
                      className="btn btn--secondary"
                      href={api.attachmentUrl(requestId, attachment.id)}
                      download={attachment.fileName}
                      rel="noopener"
                    >
                      {t('details.download')}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card__title">{t('details.timeline')}</h2>
            {request.timeline.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--c-text-muted)' }}>{t('details.noTimeline')}</p>
            ) : (
              <ol className="timeline">
                {request.timeline.map((entry) => (
                  <li
                    key={entry.id}
                    className={`timeline__item ${
                      entry.visibility === LOG_VISIBILITY.CITIZEN_VISIBLE
                        ? 'timeline__item--citizen'
                        : 'timeline__item--internal'
                    }`}
                  >
                    <div className="timeline__head">
                      <strong>{t(LOG_ACTION_LABEL_KEYS[entry.action] ?? 'log.statusChanged')}</strong>
                      <span
                        className={`badge ${
                          entry.visibility === LOG_VISIBILITY.CITIZEN_VISIBLE ? 'badge--citizen' : 'badge--internal'
                        }`}
                      >
                        {entry.visibility === LOG_VISIBILITY.CITIZEN_VISIBLE
                          ? t('details.citizenVisible')
                          : t('details.internalOnly')}
                      </span>
                      <span className="timeline__when">{formatDateTime(entry.createdAt, locale)}</span>
                    </div>
                    {entry.newStatus && (
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge status={entry.newStatus} />
                      </div>
                    )}
                    {entry.message && <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{entry.message}</p>}
                    {entry.actor?.type === 'STAFF' && (
                      <span className="timeline__when">{localizedName(entry.actor)}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div>
          {permissions?.canAssign && (
            <section className="card">
              <h2 className="card__title">{t('assign.heading')}</h2>
              <ErrorPanel message={assignMutation.isError ? toMessage(assignMutation.error) : null} />
              {assignableStaff.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--c-text-muted)' }}>{t('assign.noCandidates')}</p>
              ) : (
                <div className="stack">
                  <SelectField
                    label={t('assign.label')}
                    value={assignee || request.assignee?.id || ''}
                    onChange={setAssignee}
                    options={[
                      { value: '', label: t('common.unassigned') },
                      ...assignableStaff.map((member) => ({
                        value: member.id,
                        label: `${localizedName(member)} — ${t(`role.${member.role}`)}`,
                      })),
                    ]}
                    disabled={terminal}
                  />
                  <Button onClick={() => assignMutation.mutate()} disabled={terminal || assignMutation.isPending}>
                    {t('assign.submit')}
                  </Button>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <h2 className="card__title">{t('status.heading')}</h2>
            {terminal ? (
              <p className="panel panel--warn" style={{ margin: 0 }}>
                {t('status.terminal')}
              </p>
            ) : (
              <div className="stack">
                <ErrorPanel message={statusMutation.isError ? toMessage(statusMutation.error) : null} />
                <SelectField
                  label={t('status.label')}
                  value={statusValue}
                  onChange={(value) => {
                    setStatusValue(value);
                    if (value === 'NEED_INFO') setStatusNoteVisibility(LOG_VISIBILITY.CITIZEN_VISIBLE);
                  }}
                  options={[
                    { value: '', label: '—' },
                    // Only transitions the API says are legal from here.
                    ...request.allowedTransitions.map((value) => ({ value, label: t(`status.${value}`) })),
                  ]}
                />
                {needsCitizenNote && (
                  <p className="panel panel--info" style={{ margin: 0 }}>
                    {t('status.needInfoNote')}
                  </p>
                )}
                <TextArea label={t('status.noteLabel')} value={statusNote} onChange={setStatusNote} />
                <SelectField
                  label={t('status.noteVisibility')}
                  value={statusNoteVisibility}
                  onChange={setStatusNoteVisibility}
                  disabled={needsCitizenNote}
                  options={[
                    { value: LOG_VISIBILITY.CITIZEN_VISIBLE, label: t('details.citizenVisible') },
                    { value: LOG_VISIBILITY.INTERNAL, label: t('details.internalOnly') },
                  ]}
                />
                <Button
                  onClick={() => statusMutation.mutate()}
                  disabled={
                    !statusValue || statusMutation.isPending || (needsCitizenNote && statusNote.trim().length < 2)
                  }
                >
                  {t('status.submit')}
                </Button>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card__title">{t('note.heading')}</h2>
            <div className="stack">
              <ErrorPanel message={noteMutation.isError ? toMessage(noteMutation.error) : null} />
              <TextArea label={t('note.label')} value={noteText} onChange={setNoteText} />
              <SelectField
                label={t('note.visibility')}
                value={noteVisibility}
                onChange={setNoteVisibility}
                options={[
                  { value: LOG_VISIBILITY.INTERNAL, label: t('details.internalOnly') },
                  { value: LOG_VISIBILITY.CITIZEN_VISIBLE, label: t('details.citizenVisible') },
                ]}
              />
              {noteVisibility === LOG_VISIBILITY.INTERNAL && (
                <p className="field__hint">{t('note.internalWarning')}</p>
              )}
              <Button onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending || noteText.trim().length < 2}>
                {t('note.submit')}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
