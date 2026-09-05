import { maskPhone } from '@dhofar/shared';

import { getConfig } from '../../config/index.js';
import { logger } from '../logger.js';

/**
 * Development SMS provider.
 *
 * The OTP is printed to the console ONLY when NODE_ENV=development, and never
 * through the structured logger (whose redaction list would strip it anyway,
 * and whose output may be shipped to a log aggregator). In `test` it is captured
 * in memory so the integration suite can read it without any I/O.
 */

const sent = [];

export function createMockSmsProvider() {
  const config = getConfig();

  return {
    name: 'mock',

    async sendOtp(phoneNumber, code) {
      sent.push({ phoneNumber, code, at: new Date().toISOString() });

      if (config.isDevelopment) {
        // eslint-disable-next-line no-console
        console.warn(`\n  [DEV SMS] ${maskPhone(phoneNumber)} -> OTP ${code}\n`);
      }

      logger.info({ to: maskPhone(phoneNumber), provider: 'mock' }, 'otp dispatched');
      return { accepted: true, providerMessageId: `mock-${sent.length}` };
    },
  };
}

/** Test-only accessors. Never imported by src/. */
export function readSentMessages() {
  return [...sent];
}

export function clearSentMessages() {
  sent.length = 0;
}
