import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local idle countdown.
 *
 * This is a COURTESY, not a control. The server evaluates the same two minutes
 * on every request (apps/api/src/auth/citizenSession.js); this timer exists only
 * so the citizen sees a warning instead of being dropped mid-sentence.
 *
 * Because it is not a control, it is safe that it can be paused by a background
 * tab or a debugger - the next API call still fails with SESSION_EXPIRED.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
const TICK_MS = 1000;
// Activity resets are throttled so a scroll gesture does not fire hundreds of
// state updates per second.
const RESET_THROTTLE_MS = 1000;

export function useIdleTimer({ enabled, timeoutSeconds, warningSeconds, onWarn, onExpire }) {
  const [secondsRemaining, setSecondsRemaining] = useState(timeoutSeconds);
  const [isWarning, setIsWarning] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const lastResetRef = useRef(0);
  const warnedRef = useRef(false);
  const expiredRef = useRef(false);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    expiredRef.current = false;
    setIsWarning(false);
    setSecondsRemaining(timeoutSeconds);
  }, [timeoutSeconds]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastResetRef.current < RESET_THROTTLE_MS) return;
      lastResetRef.current = now;
      // While the warning dialog is open, only an explicit choice counts as
      // activity - otherwise a passer-by brushing the screen would silently
      // extend the previous citizen's session.
      if (warnedRef.current) return;
      reset();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, timeoutSeconds - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= warningSeconds && !warnedRef.current && remaining > 0) {
        warnedRef.current = true;
        setIsWarning(true);
        onWarn?.();
      }

      if (remaining === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    }, TICK_MS);

    return () => {
      clearInterval(interval);
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, handleActivity);
    };
  }, [enabled, timeoutSeconds, warningSeconds, onWarn, onExpire, reset]);

  useEffect(() => {
    if (!enabled) {
      setIsWarning(false);
      setSecondsRemaining(timeoutSeconds);
    }
  }, [enabled, timeoutSeconds]);

  return { secondsRemaining, isWarning, reset };
}

export default useIdleTimer;
