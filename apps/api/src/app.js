import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { getConfig } from './config/index.js';
import { logger } from './infra/logger.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { errorHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { issueCsrfCookie } from './middleware/csrf.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { preventParameterPollution } from './middleware/hpp.js';
import { requestId } from './middleware/requestId.js';
import apiRoutes from './routes/index.js';

const API_PREFIX = '/api/v1';

export function createApp() {
  const config = getConfig();
  const app = express();

  // Required for correct req.ip behind the reverse proxy; rate limiting is
  // meaningless if every request appears to come from the proxy.
  app.set('trust proxy', config.server.trustProxy);
  app.disable('x-powered-by');
  app.set('etag', false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          // The API serves JSON, not markup. Anything that renders is a bug.
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          // Swagger UI, when mounted, needs its own inline styles.
          ...(config.docs.swaggerEnabled
            ? {
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
              }
            : {}),
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      noSniff: true,
      frameguard: { action: 'deny' },
    }),
  );

  app.use(
    cors({
      // Exact-match allowlist. No wildcard, no reflection of arbitrary origins,
      // because credentials are cookies.
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (config.cors.allowedOrigins.includes(origin)) return callback(null, true);
        logger.warn({ origin }, 'blocked cross-origin request');
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id', 'X-Kiosk-Id'],
      exposedHeaders: ['X-Request-Id', 'X-Session-Expires-In', 'Retry-After'],
      maxAge: 600,
    }),
  );

  app.use(requestId);
  app.use(httpLogger);

  app.use(express.json({ limit: config.server.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.server.urlencodedBodyLimit }));
  app.use(cookieParser(config.secrets.sessionSecret));
  app.use(preventParameterPollution());

  app.use(globalLimiter);
  app.use(issueCsrfCookie);

  if (config.docs.swaggerEnabled) {
    const document = buildOpenApiDocument({ serverUrl: API_PREFIX });
    app.get('/api/docs.json', (_req, res) => res.json(document));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'Dhofar Portal API' }));
  }

  app.use(API_PREFIX, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
