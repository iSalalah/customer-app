/**
 * Single source of truth for request status values and the transition matrix.
 * The API, the tests and both SPAs import from here; no status string is
 * written literally anywhere else in the monorepo.
 */

export const REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  NEED_INFO: 'NEED_INFO',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const REQUEST_STATUSES = Object.freeze(Object.values(REQUEST_STATUS));

/** Statuses from which no further transition is permitted. */
export const TERMINAL_STATUSES = Object.freeze([REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED]);

/** from -> allowed destinations. Mirrors docs/04-workflow.md exactly. */
export const STATUS_TRANSITIONS = Object.freeze({
  [REQUEST_STATUS.PENDING]: Object.freeze([
    REQUEST_STATUS.IN_PROGRESS,
    REQUEST_STATUS.NEED_INFO,
    REQUEST_STATUS.APPROVED,
    REQUEST_STATUS.REJECTED,
  ]),
  [REQUEST_STATUS.IN_PROGRESS]: Object.freeze([
    REQUEST_STATUS.NEED_INFO,
    REQUEST_STATUS.APPROVED,
    REQUEST_STATUS.REJECTED,
  ]),
  [REQUEST_STATUS.NEED_INFO]: Object.freeze([
    REQUEST_STATUS.IN_PROGRESS,
    REQUEST_STATUS.APPROVED,
    REQUEST_STATUS.REJECTED,
  ]),
  [REQUEST_STATUS.APPROVED]: Object.freeze([]),
  [REQUEST_STATUS.REJECTED]: Object.freeze([]),
});

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function allowedTransitionsFrom(status) {
  return STATUS_TRANSITIONS[status] ?? [];
}

export function canTransition(from, to) {
  if (!REQUEST_STATUSES.includes(from) || !REQUEST_STATUSES.includes(to)) return false;
  return allowedTransitionsFrom(from).includes(to);
}

/**
 * Coarsened labels for the unauthenticated tracking endpoint.
 * APPROVED and REJECTED intentionally collapse to one label so that an
 * enumerator cannot mine decision outcomes from reference numbers.
 */
export const PUBLIC_STATUS = Object.freeze({
  RECEIVED: 'RECEIVED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  CLOSED: 'CLOSED',
});

const PUBLIC_STATUS_MAP = Object.freeze({
  [REQUEST_STATUS.PENDING]: PUBLIC_STATUS.RECEIVED,
  [REQUEST_STATUS.IN_PROGRESS]: PUBLIC_STATUS.UNDER_REVIEW,
  [REQUEST_STATUS.NEED_INFO]: PUBLIC_STATUS.ACTION_REQUIRED,
  [REQUEST_STATUS.APPROVED]: PUBLIC_STATUS.CLOSED,
  [REQUEST_STATUS.REJECTED]: PUBLIC_STATUS.CLOSED,
});

export function toPublicStatus(status) {
  return PUBLIC_STATUS_MAP[status] ?? PUBLIC_STATUS.RECEIVED;
}

/** i18n keys only - display text lives in the SPA translation files. */
export const STATUS_LABEL_KEYS = Object.freeze({
  [REQUEST_STATUS.PENDING]: 'status.pending',
  [REQUEST_STATUS.IN_PROGRESS]: 'status.inProgress',
  [REQUEST_STATUS.NEED_INFO]: 'status.needInfo',
  [REQUEST_STATUS.APPROVED]: 'status.approved',
  [REQUEST_STATUS.REJECTED]: 'status.rejected',
});

export const PUBLIC_STATUS_LABEL_KEYS = Object.freeze({
  [PUBLIC_STATUS.RECEIVED]: 'publicStatus.received',
  [PUBLIC_STATUS.UNDER_REVIEW]: 'publicStatus.underReview',
  [PUBLIC_STATUS.ACTION_REQUIRED]: 'publicStatus.actionRequired',
  [PUBLIC_STATUS.CLOSED]: 'publicStatus.closed',
});
