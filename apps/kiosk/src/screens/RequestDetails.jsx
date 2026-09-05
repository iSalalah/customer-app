import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ACCEPT_ATTRIBUTE,
  LOG_ACTION_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  TEXT_LIMITS,
  formatBytes,
  formatDateTime,
} from '@dhofar/shared';

import { api } from '../api/client.js';
import { useErrorMessage, useI18n, useLocalizedName } from '../i18n/index.js';
import {
  ErrorPanel,
  Screen,
  Spinner,
  StatusBadge,
  TextArea,
  TouchButton,
} from '../components/index.jsx';
import VirtualKeyboard from '../components/VirtualKeyboard.jsx';

/**
 * Citizen request detail.
 *
 * Everything rendered here comes from the citizen endpoint, which returns only
 * citizen-visible timeline entries and carries no staff identity. There is no
 * client-side filtering of internal notes, because internal notes never arrive.
 */
export default function RequestDetails() {
  const { referenceNumber } = useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const localizedName = useLocalizedName();

  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState([]);
  const fileInputRef = useRef(null);

  const query = useQuery({
    queryKey: ['citizen-request', referenceNumber],
    queryFn: () => api.getMyRequest(referenceNumber),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('message', reply.trim());
      for (const file of replyFiles) formData.append('attachments', file);
      return api.addReply({ referenceNumber, formData });
    },
    onSuccess: () => {
      setReply('');
      setReplyFiles([]);
      queryClient.invalidateQueries({ queryKey: ['citizen-request', referenceNumber] });
    },
  });

  const request = query.data?.data?.request;

  if (query.isPending) return <Screen title={t('details.heading')}><Spinner /></Screen>;
  if (query.isError) {
    return (
      <Screen title={t('details.heading')}>
        <ErrorPanel message={toMessage(query.error)} onRetry={query.refetch} />
        <TouchButton variant="ghost" onClick={() => navigate('/dashboard')} style={{ marginTop: 'var(--sp-3)' }}>
          {t('common.back')}
        </TouchButton>
      </Screen>
    );
  }

  return (
    <Screen title={request.title}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="reference" style={{ fontSize: 'var(--fs-lg)' }}>{request.referenceNumber}</span>
          <StatusBadge status={request.status} labelKey={STATUS_LABEL_KEYS[request.status]} />
        </div>

        <div className="card__meta">
          <span>{localizedName(request.service)}</span>
          <span>{localizedName(request.department)}</span>
          <span>
            {t('dashboard.submitted')}: {formatDateTime(request.createdAt, locale)}
          </span>
        </div>

        <p style={{ whiteSpace: 'pre-wrap' }}>{request.description}</p>

        <section aria-labelledby="attachments-heading">
          <h2 id="attachments-heading">{t('details.attachments')}</h2>
          {request.attachments.length === 0 ? (
            <p style={{ color: 'var(--c-text-muted)' }}>{t('wizard.noFiles')}</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {request.attachments.map((attachment) => (
                <li key={attachment.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {attachment.fileName}
                      <span style={{ color: 'var(--c-text-muted)' }}> — {formatBytes(attachment.sizeBytes, locale)}</span>
                    </span>
                    {/* A plain link, so the browser's own download handling is
                        used; the API authorises the request via the cookie. */}
                    <a
                      className="btn btn--secondary"
                      href={api.attachmentUrl(request.referenceNumber, attachment.id)}
                      download={attachment.fileName}
                      rel="noopener"
                    >
                      {t('details.download')}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">{t('details.timeline')}</h2>
          {request.timeline.length === 0 ? (
            <p style={{ color: 'var(--c-text-muted)' }}>{t('details.noTimeline')}</p>
          ) : (
            <ol className="timeline">
              {request.timeline.map((entry) => (
                <li key={entry.id} className="timeline__item">
                  <p style={{ margin: 0, fontWeight: 700 }}>{t(LOG_ACTION_LABEL_KEYS[entry.action] ?? 'log.statusChanged')}</p>
                  {entry.newStatus && (
                    <p style={{ margin: 0 }}>{t(STATUS_LABEL_KEYS[entry.newStatus])}</p>
                  )}
                  {entry.message && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{entry.message}</p>}
                  <span className="timeline__when">{formatDateTime(entry.createdAt, locale)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {request.canReply ? (
          <section aria-labelledby="reply-heading" className="panel panel--info">
            <h2 id="reply-heading">{t('details.replyHeading')}</h2>
            <div className="stack">
              <ErrorPanel message={replyMutation.isError ? toMessage(replyMutation.error) : null} />
              <TextArea
                label={t('details.replyLabel')}
                hint={t('details.replyHint')}
                value={reply}
                onChange={setReply}
                maxLength={TEXT_LIMITS.REPLY_MAX}
              />
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                onChange={(event) => setReplyFiles(Array.from(event.target.files ?? []))}
              />
              <div className="row">
                <TouchButton variant="secondary" size="normal" onClick={() => fileInputRef.current?.click()}>
                  {t('wizard.addFile')}
                </TouchButton>
                {replyFiles.length > 0 && (
                  <span>{replyFiles.map((file) => file.name).join('، ')}</span>
                )}
              </div>
              <VirtualKeyboard value={reply} onChange={setReply} maxLength={TEXT_LIMITS.REPLY_MAX} />
              <TouchButton
                onClick={() => replyMutation.mutate()}
                disabled={replyMutation.isPending || reply.trim().length < TEXT_LIMITS.REPLY_MIN}
              >
                {replyMutation.isPending ? t('common.loading') : t('details.replySubmit')}
              </TouchButton>
            </div>
          </section>
        ) : null}

        <TouchButton variant="ghost" onClick={() => navigate('/dashboard')}>
          {t('common.back')}
        </TouchButton>
      </div>
    </Screen>
  );
}
