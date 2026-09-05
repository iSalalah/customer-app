/** RequestLog vocabulary, shared with the Prisma enums of the same names. */

export const LOG_VISIBILITY = Object.freeze({
  INTERNAL: 'INTERNAL',
  CITIZEN_VISIBLE: 'CITIZEN_VISIBLE',
});

export const LOG_VISIBILITIES = Object.freeze(Object.values(LOG_VISIBILITY));

export const LOG_ACTOR_TYPE = Object.freeze({
  CITIZEN: 'CITIZEN',
  STAFF: 'STAFF',
  SYSTEM: 'SYSTEM',
});

export const REQUEST_LOG_ACTION = Object.freeze({
  CREATED: 'CREATED',
  AUTO_ROUTED: 'AUTO_ROUTED',
  ASSIGNED: 'ASSIGNED',
  REASSIGNED: 'REASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  INTERNAL_NOTE_ADDED: 'INTERNAL_NOTE_ADDED',
  CITIZEN_VISIBLE_NOTE_ADDED: 'CITIZEN_VISIBLE_NOTE_ADDED',
  CITIZEN_REPLIED: 'CITIZEN_REPLIED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
  ATTACHMENT_REJECTED: 'ATTACHMENT_REJECTED',
});

export const REQUEST_LOG_ACTIONS = Object.freeze(Object.values(REQUEST_LOG_ACTION));

/**
 * Actions a citizen is ever allowed to see, even if a row were mis-flagged
 * CITIZEN_VISIBLE. Defence in depth behind the visibility column.
 */
export const CITIZEN_SAFE_ACTIONS = Object.freeze([
  REQUEST_LOG_ACTION.CREATED,
  REQUEST_LOG_ACTION.STATUS_CHANGED,
  REQUEST_LOG_ACTION.CITIZEN_VISIBLE_NOTE_ADDED,
  REQUEST_LOG_ACTION.CITIZEN_REPLIED,
  REQUEST_LOG_ACTION.ATTACHMENT_ADDED,
]);

export const LOG_ACTION_LABEL_KEYS = Object.freeze({
  [REQUEST_LOG_ACTION.CREATED]: 'log.created',
  [REQUEST_LOG_ACTION.AUTO_ROUTED]: 'log.autoRouted',
  [REQUEST_LOG_ACTION.ASSIGNED]: 'log.assigned',
  [REQUEST_LOG_ACTION.REASSIGNED]: 'log.reassigned',
  [REQUEST_LOG_ACTION.STATUS_CHANGED]: 'log.statusChanged',
  [REQUEST_LOG_ACTION.INTERNAL_NOTE_ADDED]: 'log.internalNote',
  [REQUEST_LOG_ACTION.CITIZEN_VISIBLE_NOTE_ADDED]: 'log.citizenNote',
  [REQUEST_LOG_ACTION.CITIZEN_REPLIED]: 'log.citizenReplied',
  [REQUEST_LOG_ACTION.ATTACHMENT_ADDED]: 'log.attachmentAdded',
  [REQUEST_LOG_ACTION.ATTACHMENT_REJECTED]: 'log.attachmentRejected',
});
