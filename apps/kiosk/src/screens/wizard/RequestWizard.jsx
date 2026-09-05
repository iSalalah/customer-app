import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import {
  ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENTS_PER_REQUEST,
  MAX_FILE_SIZE_BYTES,
  TEXT_LIMITS,
  formatBytes,
} from '@dhofar/shared';

import { api } from '../../api/client.js';
import { useErrorMessage, useI18n, useLocalizedName } from '../../i18n/index.js';
import {
  ErrorPanel,
  Screen,
  Spinner,
  Stepper,
  TextArea,
  TextField,
  Tile,
  TouchButton,
} from '../../components/index.jsx';
import VirtualKeyboard from '../../components/VirtualKeyboard.jsx';

const STEPS = ['wizard.step1', 'wizard.step2', 'wizard.step3', 'wizard.step4'];

/**
 * Request submission wizard.
 *
 * Two things here are load-bearing beyond the UI:
 *
 *   1. The idempotency key is generated ONCE, when the wizard mounts, and is
 *      reused for every retry of the same submission. A double tap, a flaky
 *      network retry and an impatient citizen all resolve to one request.
 *   2. The routing target shown on screen is what the API told us about the
 *      service. It is displayed for reassurance and never sent back - the server
 *      re-derives it from the service row regardless of anything sent here.
 */
export default function RequestWizard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const localizedName = useLocalizedName();
  const toMessage = useErrorMessage();

  const [stepIndex, setStepIndex] = useState(0);
  const [departmentId, setDepartmentId] = useState(null);
  const [service, setService] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState(null);

  const fileInputRef = useRef(null);
  // crypto.randomUUID is available in every kiosk-class browser this targets.
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  // Guards against a second submit slipping through before `submitting` renders.
  const submittedRef = useRef(false);

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.listDepartments(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const servicesQuery = useQuery({
    queryKey: ['services', departmentId],
    queryFn: () => api.listServices(departmentId),
    enabled: Boolean(departmentId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const departments = departmentsQuery.data?.data?.departments ?? [];
  const services = servicesQuery.data?.data?.services ?? [];

  const routingTarget = useMemo(() => {
    if (!service) return '';
    const parts = [localizedName(service.department)];
    if (service.section) parts.push(localizedName(service.section));
    return parts.filter(Boolean).join(' / ');
  }, [service, localizedName]);

  const addFiles = (fileList) => {
    setError(null);
    const incoming = Array.from(fileList ?? []);
    const accepted = [];

    for (const file of incoming) {
      if (files.length + accepted.length >= MAX_ATTACHMENTS_PER_REQUEST) {
        setError(t('error.ATTACHMENT_LIMIT_EXCEEDED'));
        break;
      }
      // A client-side size check saves a 10 MB upload that the server would
      // reject anyway. The server check remains authoritative.
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(t('error.FILE_TOO_LARGE'));
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length > 0) setFiles((current) => [...current, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index) => setFiles((current) => current.filter((_, i) => i !== index));

  const validateDetails = () => {
    const errors = {};
    if (title.trim().length < TEXT_LIMITS.TITLE_MIN) errors.title = t('wizard.titleHint');
    if (description.trim().length < TEXT_LIMITS.DESCRIPTION_MIN) errors.description = t('wizard.descriptionHint');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const canAdvance = () => {
    if (stepIndex === 0) return Boolean(service);
    if (stepIndex === 1) return validateDetails();
    if (stepIndex === 2) {
      if (service?.attachmentPolicy?.required && files.length < (service.attachmentPolicy.min || 1)) {
        setError(t('wizard.attachmentsRequired'));
        return false;
      }
      return true;
    }
    return true;
  };

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('serviceId', service.id);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      for (const file of files) formData.append('attachments', file);

      const { data } = await api.createRequest({
        formData,
        idempotencyKey: idempotencyKeyRef.current,
      });

      navigate('/receipt', { replace: true, state: { receipt: data } });
    } catch (apiError) {
      // The key is intentionally NOT regenerated: a retry must be recognised as
      // the same submission, not treated as a new one.
      submittedRef.current = false;
      setError(toMessage(apiError));
    } finally {
      setSubmitting(false);
    }
  }, [service, title, description, files, navigate, toMessage]);

  return (
    <Screen title={t('home.newRequest')}>
      <Stepper steps={STEPS} currentIndex={stepIndex} />

      <p aria-live="polite" className="visually-hidden">
        {t('wizard.step', { current: stepIndex + 1, total: STEPS.length })}
      </p>

      <ErrorPanel message={error} />

      {stepIndex === 0 && (
        <div className="stack">
          <h2>{t('wizard.selectDepartment')}</h2>
          {departmentsQuery.isPending && <Spinner />}
          {departmentsQuery.isError && (
            <ErrorPanel message={toMessage(departmentsQuery.error)} onRetry={departmentsQuery.refetch} />
          )}
          <div className="grid-cards">
            {departments.map((department) => (
              <Tile
                key={department.id}
                title={localizedName(department)}
                selected={departmentId === department.id}
                onClick={() => {
                  setDepartmentId(department.id);
                  setService(null);
                }}
              />
            ))}
          </div>

          {departmentId && (
            <>
              <h2>{t('wizard.selectService')}</h2>
              {servicesQuery.isPending && <Spinner />}
              <div className="grid-cards">
                {services.map((item) => (
                  <Tile
                    key={item.id}
                    title={localizedName(item)}
                    hint={localizedName({ nameAr: item.descriptionAr, nameEn: item.descriptionEn }, '')}
                    selected={service?.id === item.id}
                    onClick={() => setService(item)}
                  />
                ))}
              </div>
              {service && (
                <p className="panel panel--info" role="status">
                  {t('wizard.routedTo', { target: routingTarget })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {stepIndex === 1 && (
        <div className="stack">
          <TextField
            label={t('wizard.titleLabel')}
            hint={t('wizard.titleHint')}
            error={fieldErrors.title}
            value={title}
            onChange={setTitle}
            onFocus={() => setActiveField('title')}
            maxLength={TEXT_LIMITS.TITLE_MAX}
          />
          <TextArea
            label={t('wizard.descriptionLabel')}
            hint={t('wizard.descriptionHint')}
            error={fieldErrors.description}
            value={description}
            onChange={setDescription}
            onFocus={() => setActiveField('description')}
            maxLength={TEXT_LIMITS.DESCRIPTION_MAX}
          />
          <VirtualKeyboard
            value={activeField === 'description' ? description : title}
            onChange={activeField === 'description' ? setDescription : setTitle}
            maxLength={activeField === 'description' ? TEXT_LIMITS.DESCRIPTION_MAX : TEXT_LIMITS.TITLE_MAX}
          />
        </div>
      )}

      {stepIndex === 2 && (
        <div className="stack">
          <h2>{t('wizard.attachmentsLabel')}</h2>
          <p className="field__hint">{t('wizard.attachmentsHint')}</p>
          {service?.attachmentPolicy?.required && (
            <p className="panel panel--info">{t('wizard.attachmentsRequired')}</p>
          )}

          <input
            ref={fileInputRef}
            id="attachments"
            className="visually-hidden"
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            onChange={(event) => addFiles(event.target.files)}
          />
          <TouchButton
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_ATTACHMENTS_PER_REQUEST}
          >
            {t('wizard.addFile')}
          </TouchButton>

          {files.length === 0 ? (
            <p style={{ color: 'var(--c-text-muted)' }}>{t('wizard.noFiles')}</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {file.name}
                      <span style={{ color: 'var(--c-text-muted)' }}> — {formatBytes(file.size)}</span>
                    </span>
                    <TouchButton
                      size="normal"
                      variant="ghost"
                      onClick={() => removeFile(index)}
                      aria-label={t('wizard.removeFile', { name: file.name })}
                    >
                      ✕
                    </TouchButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stepIndex === 3 && (
        <div className="stack">
          <h2>{t('wizard.reviewHeading')}</h2>
          <dl className="card">
            <dt style={{ fontWeight: 700 }}>{t('wizard.reviewService')}</dt>
            <dd style={{ margin: '0 0 var(--sp-2)' }}>{localizedName(service)}</dd>
            <dt style={{ fontWeight: 700 }}>{t('wizard.reviewDepartment')}</dt>
            <dd style={{ margin: '0 0 var(--sp-2)' }}>{routingTarget}</dd>
            <dt style={{ fontWeight: 700 }}>{t('wizard.reviewTitle')}</dt>
            <dd style={{ margin: '0 0 var(--sp-2)' }}>{title}</dd>
            <dt style={{ fontWeight: 700 }}>{t('wizard.reviewDescription')}</dt>
            <dd style={{ margin: '0 0 var(--sp-2)', whiteSpace: 'pre-wrap' }}>{description}</dd>
            <dt style={{ fontWeight: 700 }}>{t('wizard.reviewFiles')}</dt>
            <dd style={{ margin: 0 }}>
              {files.length === 0 ? t('common.none') : files.map((file) => file.name).join('، ')}
            </dd>
          </dl>
          {submitting && <p role="status">{t('wizard.submitting')}</p>}
        </div>
      )}

      <div className="row" style={{ marginTop: 'var(--sp-5)' }}>
        {stepIndex > 0 && (
          <TouchButton variant="ghost" onClick={() => setStepIndex((value) => value - 1)} disabled={submitting}>
            {t('common.back')}
          </TouchButton>
        )}
        {stepIndex < STEPS.length - 1 && (
          <TouchButton
            onClick={() => {
              if (canAdvance()) {
                setError(null);
                setStepIndex((value) => value + 1);
              }
            }}
          >
            {t('common.next')}
          </TouchButton>
        )}
        {stepIndex === STEPS.length - 1 && (
          <TouchButton onClick={submit} disabled={submitting}>
            {submitting ? t('common.loading') : t('common.submit')}
          </TouchButton>
        )}
        <TouchButton variant="ghost" onClick={() => navigate('/dashboard')} disabled={submitting}>
          {t('common.cancel')}
        </TouchButton>
      </div>
    </Screen>
  );
}
