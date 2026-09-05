/**
 * The response envelope from section 15 of the specification. Every controller
 * returns through these helpers so the shape can never drift between endpoints.
 */

export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data: data ?? {} };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated(res, data, meta) {
  return sendSuccess(res, data, { status: 201, meta });
}

export function sendAccepted(res, data, meta) {
  return sendSuccess(res, data, { status: 202, meta });
}

export function sendNoContent(res) {
  return res.status(204).end();
}

export function buildErrorBody({ code, message, details = [], requestId }) {
  return {
    success: false,
    error: { code, message, details, requestId },
  };
}
