import crypto from 'node:crypto';

import { HEADER_NAMES } from '@dhofar/shared';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Correlation id. An inbound X-Request-Id is honoured only if it is short and
 * alphanumeric - an attacker-controlled value ends up in log lines and in the
 * error body, so it must not be able to carry newlines or markup.
 */
export function requestId(req, res, next) {
  const inbound = req.get(HEADER_NAMES.REQUEST_ID);
  req.id = inbound && SAFE_ID.test(inbound) ? inbound : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export default requestId;
