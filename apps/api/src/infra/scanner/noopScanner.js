/**
 * Development scanner. Reports SKIPPED rather than CLEAN so that the database
 * records honestly that no scan took place - a row must never claim to have
 * been verified when it was not.
 *
 * Production refuses to boot with MALWARE_SCAN_ENABLED=false (config/env.js).
 */
export function createNoopScanner() {
  return {
    name: 'noop',
    async scan() {
      return { status: 'SKIPPED' };
    },
  };
}
