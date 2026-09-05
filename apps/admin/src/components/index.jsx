import { useId } from 'react';

import { useI18n } from '../i18n/index.js';

/** Shared presentation components for the staff dashboard. */

export function Button({ variant = 'primary', children, ...rest }) {
  return (
    <button type="button" className={`btn btn--${variant}`} {...rest}>
      {children}
    </button>
  );
}

export function TextField({ label, hint, error, value, onChange, type = 'text', ...rest }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {error && (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextArea({ label, hint, value, onChange, ...rest }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && <span className="field__hint">{hint}</span>}
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, ...rest }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select" value={value} onChange={(event) => onChange(event.target.value)} {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Colour is always accompanied by the status word and a dot. */
export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`status status--${status}`}>{t(`status.${status}`)}</span>;
}

export function Spinner() {
  const { t } = useI18n();
  return (
    <div className="row" role="status" aria-live="polite" style={{ justifyContent: 'center', padding: 'var(--sp-4)' }}>
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{t('a11y.loading')}</span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div className="panel panel--error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
      <strong>{t('error.title')}</strong> {message}
      {onRetry && (
        <div style={{ marginTop: 'var(--sp-1)' }}>
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      {message}
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  const { t } = useI18n();
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <nav className="row" style={{ justifyContent: 'center', marginTop: 'var(--sp-3)' }} aria-label={t('common.page')}>
      <Button variant="ghost" disabled={!pagination.hasPreviousPage} onClick={() => onPage(pagination.page - 1)}>
        {t('common.previous')}
      </Button>
      <span aria-live="polite">
        {t('common.page')} {pagination.page} {t('common.of')} {pagination.totalPages}
        {' — '}
        {pagination.total} {t('common.results')}
      </span>
      <Button variant="ghost" disabled={!pagination.hasNextPage} onClick={() => onPage(pagination.page + 1)}>
        {t('common.next')}
      </Button>
    </nav>
  );
}

export function LanguageSwitch() {
  const { t, toggleLocale } = useI18n();
  return (
    <button type="button" className="btn btn--header" onClick={toggleLocale} aria-label={t('app.languageLabel')}>
      {t('app.language')}
    </button>
  );
}

export function StatCard({ label, value }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}
