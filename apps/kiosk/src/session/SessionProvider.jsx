import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { SESSION_DEFAULTS } from '@dhofar/shared';

import { api, onSessionExpired } from '../api/client.js';
import { purgeSessionState, resetHistoryToHome } from './purge.js';
import { useIdleTimer } from './useIdleTimer.js';
import IdleWarningDialog from './IdleWarningDialog.jsx';

const SessionContext = createContext(null);

const IDLE_TIMEOUT_SECONDS = Number(import.meta.env.VITE_IDLE_TIMEOUT_SECONDS) || SESSION_DEFAULTS.CITIZEN_IDLE_TIMEOUT_SECONDS;
const IDLE_WARNING_SECONDS = Number(import.meta.env.VITE_IDLE_WARNING_SECONDS) || SESSION_DEFAULTS.CITIZEN_IDLE_WARNING_SECONDS;

/**
 * Owns the citizen session on the client.
 *
 * Three things can end a session and all three converge on `endSession`:
 *   - the citizen presses "End session"
 *   - the local idle countdown reaches zero
 *   - any API call returns SESSION_EXPIRED / UNAUTHENTICATED
 *
 * The server is the authority in all three cases; this component's job is to
 * make sure the screen is clean afterwards.
 */
export function SessionProvider({ children }) {
  const [citizen, setCitizen] = useState(null);
  const [expiredNotice, setExpiredNotice] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const endingRef = useRef(false);

  const clearLocally = useCallback(
    ({ showNotice }) => {
      setCitizen(null);
      setExpiredNotice(showNotice);
      purgeSessionState(queryClient);
      resetHistoryToHome();
      navigate('/', { replace: true });
    },
    [queryClient, navigate],
  );

  const endSession = useCallback(
    async ({ showNotice = false, callApi = true } = {}) => {
      if (endingRef.current) return;
      endingRef.current = true;
      try {
        // Best effort: the server may already have revoked the session, in which
        // case the local purge below is what matters.
        if (callApi) await api.logout().catch(() => {});
      } finally {
        clearLocally({ showNotice });
        endingRef.current = false;
      }
    },
    [clearLocally],
  );

  const startSession = useCallback((identity) => {
    setExpiredNotice(false);
    setCitizen(identity);
  }, []);

  const handleExpire = useCallback(() => {
    endSession({ showNotice: true, callApi: true });
  }, [endSession]);

  const { secondsRemaining, isWarning, reset } = useIdleTimer({
    enabled: Boolean(citizen),
    timeoutSeconds: IDLE_TIMEOUT_SECONDS,
    warningSeconds: IDLE_WARNING_SECONDS,
    onExpire: handleExpire,
  });

  // The API is the authority: if it says the session is gone, it is gone,
  // whatever the local timer believes.
  useEffect(() => onSessionExpired(() => {
    if (endingRef.current) return;
    clearLocally({ showNotice: true });
  }), [clearLocally]);

  // Back-button trap: a popstate after the session ended must not reveal the
  // previous screen.
  useEffect(() => {
    const onPopState = () => {
      if (!citizen) {
        resetHistoryToHome();
        navigate('/', { replace: true });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [citizen, navigate]);

  // A kiosk left on a citizen screen and then hidden (screensaver, tab switch)
  // ends the session rather than waiting for a return that may never come.
  useEffect(() => {
    if (!citizen) return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') endSession({ showNotice: false });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [citizen, endSession]);

  const continueSession = useCallback(async () => {
    // Touching /me both proves the server still accepts the session and slides
    // the server-side idle clock in the same call.
    try {
      await api.me();
      reset();
    } catch {
      clearLocally({ showNotice: true });
    }
  }, [reset, clearLocally]);

  const value = useMemo(
    () => ({
      citizen,
      isAuthenticated: Boolean(citizen),
      expiredNotice,
      dismissExpiredNotice: () => setExpiredNotice(false),
      startSession,
      endSession,
      secondsRemaining,
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
    }),
    [citizen, expiredNotice, startSession, endSession, secondsRemaining],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      {citizen && isWarning ? (
        <IdleWarningDialog
          secondsRemaining={secondsRemaining}
          onContinue={continueSession}
          onEnd={() => endSession({ showNotice: false })}
        />
      ) : null}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

export default SessionProvider;
