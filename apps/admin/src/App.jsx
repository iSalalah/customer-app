import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider.jsx';
import { useI18n, useLocalizedName } from './i18n/index.js';
import { Button, LanguageSwitch, Spinner } from './components/index.jsx';
import Analytics from './screens/Analytics.jsx';
import Login from './screens/Login.jsx';
import RequestDetails from './screens/RequestDetails.jsx';
import RequestsList from './screens/RequestsList.jsx';

/**
 * Route guard.
 *
 * Client-side only. It decides what to draw, never what is allowed: every screen
 * behind it calls an API that re-authenticates and re-authorises independently.
 */
function RequireStaff({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Shell({ children }) {
  const { t } = useI18n();
  const { staff, logout } = useAuth();
  const localizedName = useLocalizedName();

  return (
    <div className="layout">
      <a className="skip-link" href="#main">
        {t('a11y.skipToContent')}
      </a>

      <header className="layout__header">
        <span className="layout__title">{t('app.title')}</span>

        <nav className="layout__nav" aria-label={t('app.requests')}>
          <NavLink to="/requests">{t('app.requests')}</NavLink>
          <NavLink to="/analytics">{t('app.analytics')}</NavLink>
        </nav>

        <div className="layout__identity">
          <span>
            {t('app.signedInAs')} <strong>{localizedName(staff)}</strong>
            {staff?.role ? ` — ${t(`role.${staff.role}`)}` : ''}
          </span>
          <LanguageSwitch />
          <Button variant="header" onClick={logout}>
            {t('app.signOut')}
          </Button>
        </div>
      </header>

      <main className="layout__main" id="main" aria-label={t('a11y.mainContent')}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/requests"
        element={
          <RequireStaff>
            <Shell>
              <RequestsList />
            </Shell>
          </RequireStaff>
        }
      />
      <Route
        path="/requests/:requestId"
        element={
          <RequireStaff>
            <Shell>
              <RequestDetails />
            </Shell>
          </RequireStaff>
        }
      />
      <Route
        path="/analytics"
        element={
          <RequireStaff>
            <Shell>
              <Analytics />
            </Shell>
          </RequireStaff>
        }
      />
      <Route path="*" element={<Navigate to="/requests" replace />} />
    </Routes>
  );
}
