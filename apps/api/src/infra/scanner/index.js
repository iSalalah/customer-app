import { getConfig } from '../../config/index.js';
import { createClamavScanner } from './clamavScanner.js';
import { createNoopScanner } from './noopScanner.js';

/**
 * Malware-scanning adapter interface:
 *
 *   scan(buffer, meta) -> { status: 'CLEAN' | 'INFECTED' | 'SKIPPED', signature?: string }
 *
 * A scanner that cannot reach its backend returns INFECTED, not CLEAN. Failing
 * open on an antivirus check would make the control decorative.
 */

const config = getConfig();

let scanner = null;

export function getScanner() {
  if (scanner) return scanner;
  if (!config.scanner.enabled) {
    scanner = createNoopScanner();
  } else if (config.scanner.driver === 'clamav') {
    scanner = createClamavScanner(config.scanner.clamav);
  } else {
    scanner = createNoopScanner();
  }
  return scanner;
}

export function setScanner(next) {
  scanner = next;
}

export const SCAN_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  SKIPPED: 'SKIPPED',
});
