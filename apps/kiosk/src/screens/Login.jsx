import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { formatCountdown, formatNationalForDisplay, isValidOmanPhone, maskPhone, normalizeOmanPhone } from '@dhofar/shared';

import { api } from '../api/client.js';
import { useErrorMessage, useI18n } from '../i18n/index.js';
import { useSession } from '../session/SessionProvider.jsx';
import { ErrorPanel, Screen, TextField, TouchButton } from '../components/index.jsx';
import VirtualKeyboard, { KEYBOARD_LAYOUT } from '../components/VirtualKeyboard.jsx';

const STEP = { PHONE: 'phone', CODE: 'code' };

/**
 * OTP sign-in.
 *
 * The API answers identically for known and unknown numbers, so this screen
 * never renders anything that would distinguish them: after a successful send it
 * always shows the code step, always with the same copy.
 */
export default function Login() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startSession } = useSession();
  const toMessage = useErrorMessage();

  const [step, setStep] = useState(STEP.PHONE);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);

  const next = searchParams.get('next') ?? '/dashboard';

  useEffect(() => {
    if (resendIn <= 0 && expiresIn <= 0) return undefined;
    const timer = setInterval(() => {
      setResendIn((value) => Math.max(0, value - 1));
      setExpiresIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn, expiresIn]);

  const sendCode = useCallback(
    async (isResend) => {
      setError(null);
      setFieldError(null);

      if (!isValidOmanPhone(phone)) {
        setFieldError(t('login.phoneHint'));
        return;
      }

      setBusy(true);
      try {
        const send = isResend ? api.resendOtp : api.requestOtp;
        const { data } = await send(normalizeOmanPhone(phone));
        setResendIn(data.resendAvailableInSeconds);
        setExpiresIn(data.expiresInSeconds);
        setStep(STEP.CODE);
        setCode('');
      } catch (apiError) {
        // A 429 carries a retry hint; surface it as a live countdown rather than
        // a bare error, so the citizen knows exactly how long to wait.
        if (apiError.meta?.retryAfterSeconds) setResendIn(apiError.meta.retryAfterSeconds);
        setError(toMessage(apiError));
      } finally {
        setBusy(false);
      }
    },
    [phone, t, toMessage],
  );

  const verify = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.verifyOtp(normalizeOmanPhone(phone), code);
      startSession(data.citizen);
      navigate(next, { replace: true });
    } catch (apiError) {
      setCode('');
      setError(toMessage(apiError));
    } finally {
      setBusy(false);
    }
  }, [phone, code, startSession, navigate, next, toMessage]);

  if (step === STEP.PHONE) {
    return (
      <Screen title={t('login.heading')}>
        <div className="stack">
          <ErrorPanel message={error} />
          <TextField
            label={t('login.phoneLabel')}
            hint={t('login.phoneHint')}
            error={fieldError}
            value={phone}
            onChange={setPhone}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
          />
          <VirtualKeyboard value={phone} onChange={setPhone} layout={KEYBOARD_LAYOUT.DIGITS} maxLength={16} />
          <div className="row">
            <TouchButton onClick={() => sendCode(false)} disabled={busy || phone.length === 0}>
              {busy ? t('common.loading') : t('login.sendCode')}
            </TouchButton>
            <TouchButton variant="ghost" onClick={() => navigate('/')}>
              {t('common.cancel')}
            </TouchButton>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t('login.heading')}>
      <div className="stack">
        <p role="status">
          {t('login.sentTo', { phone: maskPhone(normalizeOmanPhone(phone) ?? '') })}
          <span className="visually-hidden"> {formatNationalForDisplay(phone)}</span>
        </p>

        <ErrorPanel message={error} />

        <TextField
          label={t('login.codeLabel')}
          hint={t('login.codeHint')}
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="input--code"
          maxLength={6}
        />

        <p aria-live="polite" style={{ color: 'var(--c-text-muted)' }}>
          {expiresIn > 0 ? t('login.expiresIn', { time: formatCountdown(expiresIn) }) : t('login.expired')}
        </p>

        <VirtualKeyboard value={code} onChange={setCode} layout={KEYBOARD_LAYOUT.DIGITS} maxLength={6} />

        <div className="row">
          <TouchButton onClick={verify} disabled={busy || code.length < 4}>
            {busy ? t('common.loading') : t('login.verify')}
          </TouchButton>
          <TouchButton variant="secondary" onClick={() => sendCode(true)} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? t('login.resendIn', { seconds: formatCountdown(resendIn) }) : t('login.resend')}
          </TouchButton>
          <TouchButton
            variant="ghost"
            onClick={() => {
              setStep(STEP.PHONE);
              setCode('');
              setError(null);
            }}
          >
            {t('login.changeNumber')}
          </TouchButton>
        </div>
      </div>
    </Screen>
  );
}
