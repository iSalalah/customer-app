import { useEffect, useRef } from 'react';

import { useI18n } from '../i18n/index.js';

/**
 * Idle warning.
 *
 * Rendered as a real modal dialog: focus moves into it, Tab is trapped inside,
 * and the rest of the page is hidden from assistive technology. Escape does NOT
 * dismiss it - dismissing by accident is exactly the failure this dialog exists
 * to prevent.
 */
export default function IdleWarningDialog({ secondsRemaining, onContinue, onEnd }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const continueRef = useRef(null);

  useEffect(() => {
    continueRef.current?.focus();

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll('button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-body"
      >
        <h2 id="idle-title" className="dialog__title">
          {t('idle.title')}
        </h2>
        {/* aria-live so a screen reader announces the countdown as it changes. */}
        <p id="idle-body" className="dialog__body" aria-live="assertive">
          {t('idle.body', { seconds: secondsRemaining })}
        </p>
        <div className="dialog__actions">
          <button ref={continueRef} type="button" className="btn btn--primary btn--large" onClick={onContinue}>
            {t('idle.stay')}
          </button>
          <button type="button" className="btn btn--ghost btn--large" onClick={onEnd}>
            {t('idle.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}
