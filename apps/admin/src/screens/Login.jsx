import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider.jsx';
import { useErrorMessage, useI18n } from '../i18n/index.js';
import { ErrorPanel, LanguageSwitch, TextField } from '../components/index.jsx';

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toMessage = useErrorMessage();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = location.state?.from ?? '/requests';

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (apiError) {
      // The password field is cleared but the username is kept: a typo in the
      // password should not cost the whole form.
      setPassword('');
      setError(toMessage(apiError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="layout">
      <header className="layout__header">
        <span className="layout__title">{t('app.title')}</span>
        <LanguageSwitch />
      </header>

      <main className="layout__main" style={{ maxWidth: 460 }}>
        <form className="card" onSubmit={submit}>
          <h1>{t('login.heading')}</h1>
          <p className="field__hint">{t('login.hint')}</p>

          <ErrorPanel message={error} />

          <div className="stack">
            <TextField
              label={t('login.username')}
              value={username}
              onChange={setUsername}
              autoComplete="username"
              required
            />
            <TextField
              label={t('login.password')}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            <button type="submit" className="btn btn--primary" disabled={busy || !username || !password}>
              {busy ? t('common.loading') : t('login.submit')}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
