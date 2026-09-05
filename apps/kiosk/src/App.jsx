import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { formatCountdown } from '@dhofar/shared';

import { useI18n } from './i18n/index.js';
import { useSession } from './session/SessionProvider.jsx';
import { LanguageSwitch, TouchButton } from './components/index.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Home from './screens/Home.jsx';
import Login from './screens/Login.jsx';
import Receipt from './screens/Receipt.jsx';
import RequestDetails from './screens/RequestDetails.jsx';
import Track from './screens/Track.jsx';
import RequestWizard from './screens/wizard/RequestWizard.jsx';

/**
 * Route guard.
 *
 * Client-side only, and only for ergonomics: an unauthenticated citizen is sent
 * to sign in rather than shown a screen that would fail its first API call. The
 * API enforces the same rule on every request.
 */
function RequireCitizen({ children }) {
  const { isAuthenticated } = useSession();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, endSession, secondsRemaining } = useSession();

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>

      <header className="app__header">
        <button
          type="button"
          className="app__brand"
          onClick={() => navigate(isAuthenticated ? '/dashboard' : '/')}
          style={{ background: 'none', border: 'none', color: 'inherit', textAlign: 'start', cursor: 'pointer' }}
        >
          <span className="app__brand-title">{t('app.title')}</span>
          <span className="app__brand-subtitle">{t('app.subtitle')}</span>
        </button>

        <div className="app__header-actions">
          {isAuthenticated && (
            <>
              {/* The countdown is visible at all times, not only in the warning
                  dialog, so the limit is never a surprise. */}
              <span aria-live="off" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatCountdown(secondsRemaining)}
              </span>
              <TouchButton variant="header" size="normal" onClick={() => endSession({ showNotice: false })}>
                {t('common.endSession')}
              </TouchButton>
            </>
          )}
          <LanguageSwitch />
        </div>
      </header>

      <main className="app__main" id="main" aria-label={t('a11y.mainContent')}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/track" element={<Track />} />
          <Route path="/track/:referenceNumber" element={<Track />} />
          <Route
            path="/dashboard"
            element={
              <RequireCitizen>
                <Dashboard />
              </RequireCitizen>
            }
          />
          <Route
            path="/new"
            element={
              <RequireCitizen>
                <RequestWizard />
              </RequireCitizen>
            }
          />
          <Route
            path="/receipt"
            element={
              <RequireCitizen>
                <Receipt />
              </RequireCitizen>
            }
          />
          <Route
            path="/requests/:referenceNumber"
            element={
              <RequireCitizen>
                <RequestDetails />
              </RequireCitizen>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="app__footer">{t('home.privacyBody')}</footer>
    </div>
  );
}
