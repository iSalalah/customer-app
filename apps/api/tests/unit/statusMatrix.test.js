import {
  REQUEST_STATUS,
  REQUEST_STATUSES,
  STATUS_TRANSITIONS,
  TERMINAL_STATUSES,
  allowedTransitionsFrom,
  canTransition,
  isTerminalStatus,
  toPublicStatus,
} from '@dhofar/shared';

/** The matrix in docs/04-workflow.md, asserted cell by cell. */
const EXPECTED = {
  PENDING: { PENDING: false, IN_PROGRESS: true, NEED_INFO: true, APPROVED: true, REJECTED: true },
  IN_PROGRESS: { PENDING: false, IN_PROGRESS: false, NEED_INFO: true, APPROVED: true, REJECTED: true },
  NEED_INFO: { PENDING: false, IN_PROGRESS: true, NEED_INFO: false, APPROVED: true, REJECTED: true },
  APPROVED: { PENDING: false, IN_PROGRESS: false, NEED_INFO: false, APPROVED: false, REJECTED: false },
  REJECTED: { PENDING: false, IN_PROGRESS: false, NEED_INFO: false, APPROVED: false, REJECTED: false },
};

describe('status transition matrix', () => {
  it.each(REQUEST_STATUSES)('enforces every destination from %s', (from) => {
    for (const to of REQUEST_STATUSES) {
      expect(canTransition(from, to)).toBe(EXPECTED[from][to]);
    }
  });

  it('never allows a status to transition to itself', () => {
    for (const status of REQUEST_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('treats APPROVED and REJECTED as terminal', () => {
    expect(TERMINAL_STATUSES).toEqual([REQUEST_STATUS.APPROVED, REQUEST_STATUS.REJECTED]);
    for (const status of TERMINAL_STATUSES) {
      expect(isTerminalStatus(status)).toBe(true);
      expect(allowedTransitionsFrom(status)).toHaveLength(0);
    }
  });

  it('never allows a return to PENDING', () => {
    for (const from of REQUEST_STATUSES) {
      expect(allowedTransitionsFrom(from)).not.toContain(REQUEST_STATUS.PENDING);
    }
  });

  it('rejects unknown statuses instead of throwing', () => {
    expect(canTransition('MADE_UP', REQUEST_STATUS.APPROVED)).toBe(false);
    expect(canTransition(REQUEST_STATUS.PENDING, 'MADE_UP')).toBe(false);
    expect(canTransition(null, undefined)).toBe(false);
    expect(allowedTransitionsFrom('MADE_UP')).toEqual([]);
  });

  it('exposes a frozen matrix so it cannot be mutated at runtime', () => {
    expect(Object.isFrozen(STATUS_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(STATUS_TRANSITIONS.PENDING)).toBe(true);
  });
});

describe('public status coarsening', () => {
  it('maps internal statuses onto the public vocabulary', () => {
    expect(toPublicStatus(REQUEST_STATUS.PENDING)).toBe('RECEIVED');
    expect(toPublicStatus(REQUEST_STATUS.IN_PROGRESS)).toBe('UNDER_REVIEW');
    expect(toPublicStatus(REQUEST_STATUS.NEED_INFO)).toBe('ACTION_REQUIRED');
  });

  it('makes an approval indistinguishable from a rejection', () => {
    // This is the control that stops an enumerator mining decision outcomes.
    expect(toPublicStatus(REQUEST_STATUS.APPROVED)).toBe('CLOSED');
    expect(toPublicStatus(REQUEST_STATUS.REJECTED)).toBe('CLOSED');
    expect(toPublicStatus(REQUEST_STATUS.APPROVED)).toBe(toPublicStatus(REQUEST_STATUS.REJECTED));
  });

  it('falls back safely for an unknown status', () => {
    expect(toPublicStatus('MADE_UP')).toBe('RECEIVED');
  });
});
