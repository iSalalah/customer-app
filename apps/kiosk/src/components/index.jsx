import { useId } from 'react';

import { useI18n } from '../i18n/index.js';

/**
 * Shared presentation components.
 *
 * Every interactive element here inherits the 56px minimum touch target from
 * base.css, carries a real label, and shows a visible focus ring. None of them
 * depends on hover, right-click or a scroll gesture to reveal anything.
 */

export function Screen({ title, lead, children, actions }) {
  return (
    <section className="screen">
      {(title || lead) && (
        <header className="screen__header">
          {title && <h1>{title}</h1>}
          {lead && <p className="screen__lead">{lead}</p>}
        </header>
      )}
      {children}
      {actions && <div className="row" style={{ marginTop: 'var(--sp-4)' }}>{actions}</div>}
    </section>
  );
}

export function TouchButton({ variant = 'primary', size = 'large', block = false, children, ...rest }) {
  const classes = ['btn', `btn--${variant}`, size === 'large' ? 'btn--large' : '', block ? 'btn--block' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Tile({ title, hint, selected = false, ...rest }) {
  return (
    <button type="button" className="tile" aria-pressed={selected} {...rest}>
      <span className="tile__title">{title}</span>
      {hint && <span className="tile__hint">{hint}</span>}
    </button>
  );
}

/**
 * Text field. The error is wired through aria-describedby and aria-invalid, so
 * a screen reader announces the problem rather than only the visual red border.
 */
export function TextField({ label, hint, error, value, onChange, onFocus, type = 'text', className = '', ...rest }) {
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
        className={`input ${className}`}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
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

export function TextArea({ label, hint, error, value, onChange, onFocus, ...rest }) {
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
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
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

export function SelectField({ label, hint, value, onChange, options, ...rest }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && <span className="field__hint">{hint}</span>}
      <select
        id={id}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Status pill. Colour is reinforced by a text label and a dot, never alone. */
export function StatusBadge({ status, labelKey }) {
  const { t } = useI18n();
  return (
    <span className={`status status--${status}`}>
      <span className="visually-hidden">{t('details.status')}: </span>
      {t(labelKey)}
    </span>
  );
}

export function Spinner({ label }) {
  const { t } = useI18n();
  return (
    <div className="row" role="status" aria-live="polite" style={{ justifyContent: 'center', padding: 'var(--sp-5)' }}>
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label ?? t('a11y.loading')}</span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }) {
  const { t } = useI18n();
  if (!message) return null;
  return (
    <div className="panel panel--error" role="alert">
      <strong>{t('error.title')}</strong>
      <p style={{ margin: 'var(--sp-1) 0 0' }}>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 'var(--sp-2)' }}>
          <TouchButton variant="secondary" size="normal" onClick={onRetry}>
            {t('common.retry')}
          </TouchButton>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{title}</p>
      {hint && <p style={{ color: 'var(--c-text-muted)' }}>{hint}</p>}
      {action}
    </div>
  );
}

export function Stepper({ steps, currentIndex }) {
  const { t } = useI18n();
  return (
    <ol className="stepper" aria-label={t('a11y.stepper')}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={`stepper__item ${index < currentIndex ? 'stepper__item--done' : ''}`}
          aria-current={index === currentIndex ? 'step' : undefined}
        >
          {index + 1}. {t(step)}
        </li>
      ))}
    </ol>
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
