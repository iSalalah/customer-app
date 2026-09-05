import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  PUBLIC_STATUS_LABEL_KEYS,
  formatDateTime,
  isValidReferenceNumber,
  normalizeReferenceInput,
} from '@dhofar/shared';

import { api } from '../api/client.js';
import { useErrorMessage, useI18n } from '../i18n/index.js';
import { ErrorPanel, Screen, StatusBadge, TextField, TouchButton } from '../components/index.jsx';
import VirtualKeyboard from '../components/VirtualKeyboard.jsx';

/**
 * Public tracking.
 *
 * No sign-in, and the response deliberately carries only a coarse status and two
 * dates. The privacy note tells the citizen why they are seeing less here than
 * in their account, so the limitation reads as intentional rather than broken.
 */
export default function Track() {
  const { referenceNumber: routeReference } = useParams();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();

  const [input, setInput] = useState(routeReference ?? '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(
    async (raw) => {
      const normalized = normalizeReferenceInput(raw);
      setError(null);
      setResult(null);

      if (!isValidReferenceNumber(normalized)) {
        setError(t('track.hint'));
        return;
      }

      setBusy(true);
      try {
        const { data } = await api.trackRequest(normalized);
        setResult(data.tracking);
      } catch (apiError) {
        setError(apiError.status === 404 ? t('track.notFound') : toMessage(apiError));
      } finally {
        setBusy(false);
      }
    },
    [t, toMessage],
  );

  // A QR scan lands on /track/:referenceNumber and resolves immediately.
  useEffect(() => {
    if (routeReference) lookup(routeReference);
  }, [routeReference, lookup]);

  return (
    <Screen title={t('track.heading')} lead={t('track.lead')}>
      <div className="stack">
        <ErrorPanel message={error} />

        {!result && (
          <>
            <TextField
              label={t('track.label')}
              hint={t('track.hint')}
              value={input}
              onChange={(value) => setInput(value.toUpperCase())}
              className="input--reference"
              maxLength={20}
              autoComplete="off"
            />
            <VirtualKeyboard value={input} onChange={(value) => setInput(value.toUpperCase())} maxLength={20} />
            <div className="row">
              <TouchButton onClick={() => lookup(input)} disabled={busy || input.length === 0}>
                {busy ? t('common.loading') : t('track.submit')}
              </TouchButton>
              <TouchButton variant="ghost" onClick={() => navigate('/')}>
                {t('common.home')}
              </TouchButton>
            </div>
          </>
        )}

        {result && (
          <section className="card" aria-labelledby="track-result">
            <h2 id="track-result">{t('track.resultHeading')}</h2>
            <p className="reference" style={{ margin: 0 }}>
              {result.referenceNumber}
            </p>
            <StatusBadge status={result.status} labelKey={PUBLIC_STATUS_LABEL_KEYS[result.status]} />
            <div className="card__meta">
              <span>
                {t('dashboard.submitted')}: {formatDateTime(result.submittedAt, locale)}
              </span>
              <span>
                {t('dashboard.updated')}: {formatDateTime(result.lastUpdatedAt, locale)}
              </span>
            </div>
            <p className="panel panel--info" style={{ marginTop: 'var(--sp-2)' }}>
              {t('track.privacyNote')}
            </p>
            <div className="row">
              <TouchButton
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setInput('');
                  navigate('/track', { replace: true });
                }}
              >
                {t('track.trackAnother')}
              </TouchButton>
              <TouchButton variant="ghost" onClick={() => navigate('/')}>
                {t('common.home')}
              </TouchButton>
            </div>
          </section>
        )}
      </div>
    </Screen>
  );
}
