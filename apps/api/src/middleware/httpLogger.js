import pinoHttp from 'pino-http';

import { logger } from '../infra/logger.js';

/**
 * Structured access logging. The serialisers keep the log line to the fields
 * that are useful during an incident; headers and bodies are not logged at all,
 * so no citizen data or credential can reach the log through this path.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  quietReqLogger: true,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url, ip: req.raw?.ip };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
    err(err) {
      return { type: err.name, message: err.message, code: err.code };
    },
  },
  autoLogging: {
    ignore(req) {
      return req.url === '/api/v1/health' || req.url === '/api/v1/ready';
    },
  },
});

export default httpLogger;
