import { ERROR_CODE } from '@dhofar/shared';

import { ApiError } from '../utils/ApiError.js';

/**
 * Zod validation middleware.
 *
 * The parsed result REPLACES req.body / req.query / req.params, so downstream
 * code can only ever see validated, stripped values. Combined with `.strict()`
 * on the schemas, this is the mass-assignment control: an unexpected field is a
 * 400, not a silently persisted column.
 */

/** Arabic messages travel alongside the English one so the SPA can pick. */
const AR_FALLBACK = 'قيمة غير صالحة';

function toDetails(zodError) {
  return zodError.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
    messageAr: issue.params?.messageAr ?? AR_FALLBACK,
  }));
}

function run(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(ERROR_CODE.VALIDATION_ERROR, 'Some of the submitted values are not valid.', {
      details: toDetails(result.error),
    });
  }
  return result.data;
}

export function validateBody(schema) {
  return function validateBodyMiddleware(req, _res, next) {
    try {
      req.body = run(schema, req.body ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateQuery(schema) {
  return function validateQueryMiddleware(req, _res, next) {
    try {
      // req.query is a getter in Express 5-style setups; assign to a own property.
      req.validatedQuery = run(schema, req.query ?? {});
      req.query = req.validatedQuery;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams(schema) {
  return function validateParamsMiddleware(req, _res, next) {
    try {
      req.params = run(schema, req.params ?? {});
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validate({ body, query, params }) {
  const chain = [];
  if (params) chain.push(validateParams(params));
  if (query) chain.push(validateQuery(query));
  if (body) chain.push(validateBody(body));
  return chain;
}
