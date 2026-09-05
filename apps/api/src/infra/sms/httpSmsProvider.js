import { maskPhone } from '@dhofar/shared';

import { logger } from '../logger.js';

/**
 * Production SMS adapter for a generic HTTP gateway. Swap the body shape here to
 * match the contracted provider; nothing else in the codebase changes.
 *
 * The code is passed to the provider and to nowhere else: it is not logged, not
 * echoed in the response, and not retained after this call returns.
 */
export function createHttpSmsProvider({ endpoint, apiKey, senderId, timeoutMs }) {
  return {
    name: 'http',

    async sendOtp(phoneNumber, code) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            sender: senderId,
            recipient: phoneNumber,
            message: `Dhofar Municipality verification code: ${code}`,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          logger.error(
            { to: maskPhone(phoneNumber), status: response.status, provider: 'http' },
            'sms gateway rejected the message',
          );
          return { accepted: false, providerMessageId: null };
        }

        logger.info({ to: maskPhone(phoneNumber), provider: 'http' }, 'otp dispatched');
        return { accepted: true, providerMessageId: response.headers.get('x-message-id') };
      } catch (error) {
        logger.error(
          { to: maskPhone(phoneNumber), err: { message: error.message }, provider: 'http' },
          'sms gateway call failed',
        );
        return { accepted: false, providerMessageId: null };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
