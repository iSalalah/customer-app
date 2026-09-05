import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { formatDateTime } from '@dhofar/shared';

import { useI18n } from '../i18n/index.js';
import { useSession } from '../session/SessionProvider.jsx';
import { Screen, TouchButton } from '../components/index.jsx';
import QrCode from '../components/QrCode.jsx';

/**
 * Submission receipt.
 *
 * The receipt lives in router state, not in storage: it must disappear the
 * moment the session ends. Reaching this route without that state (a refresh,
 * a back-navigation after a purge) redirects home rather than showing a blank
 * or stale receipt.
 */
export default function Receipt() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { endSession } = useSession();

  const receipt = location.state?.receipt;
  if (!receipt) return <Navigate to="/" replace />;

  return (
    <Screen title={t('receipt.heading')} lead={t('receipt.lead')}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <p style={{ fontWeight: 700, margin: 0 }}>{t('receipt.reference')}</p>
        <p className="reference" style={{ margin: 0 }}>
          {receipt.referenceNumber}
        </p>
        <p style={{ color: 'var(--c-text-muted)' }}>{formatDateTime(receipt.createdAt, locale)}</p>

        {receipt.trackingUrl && (
          <>
            <QrCode value={receipt.trackingUrl} title={receipt.referenceNumber} />
            <p className="field__hint">{t('receipt.scanHint')}</p>
          </>
        )}

        <div className="row no-print" style={{ justifyContent: 'center' }}>
          <TouchButton onClick={() => window.print()}>{t('common.print')}</TouchButton>
          <TouchButton
            variant="secondary"
            onClick={() => navigate(`/requests/${receipt.referenceNumber}`, { replace: true })}
          >
            {t('receipt.viewRequest')}
          </TouchButton>
          {/* Finishing here ends the session outright: the citizen is done and
              the next person must not inherit the screen. */}
          <TouchButton variant="ghost" onClick={() => endSession({ showNotice: false })}>
            {t('receipt.done')}
          </TouchButton>
        </div>
      </div>
    </Screen>
  );
}
