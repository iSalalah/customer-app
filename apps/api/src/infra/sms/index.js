import { getConfig } from '../../config/index.js';
import { createHttpSmsProvider } from './httpSmsProvider.js';
import { createMockSmsProvider } from './mockSmsProvider.js';

const config = getConfig();

let provider = null;

export function getSmsProvider() {
  if (provider) return provider;
  provider =
    config.sms.driver === 'http'
      ? createHttpSmsProvider({
          endpoint: config.sms.endpoint,
          apiKey: config.sms.apiKey,
          senderId: config.sms.senderId,
          timeoutMs: config.sms.timeoutMs,
        })
      : createMockSmsProvider();
  return provider;
}

/** Test seam. */
export function setSmsProvider(next) {
  provider = next;
}
