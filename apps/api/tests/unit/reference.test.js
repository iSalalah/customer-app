import {
  REFERENCE_ALPHABET,
  REFERENCE_KEYSPACE,
  isValidReferenceNumber,
  normalizeReferenceInput,
} from '@dhofar/shared';

import { generateReferenceNumber, generateReferenceSuffix } from '../../src/infra/crypto/reference.js';

describe('reference number generation', () => {
  it('matches the DHO-YYYY-XXXXXX format', () => {
    const reference = generateReferenceNumber(new Date('2026-03-04T00:00:00Z'));
    expect(reference).toMatch(/^DHO-2026-[0-9A-HJ-NP-TV-Z]{6}$/);
    expect(isValidReferenceNumber(reference)).toBe(true);
  });

  it('uses the UTC year, not the local one', () => {
    // 23:30 on 31 December in Muscat is still 19:30 UTC the same day; the guard
    // that matters is that the year comes from getUTCFullYear.
    const reference = generateReferenceNumber(new Date('2026-12-31T23:59:59Z'));
    expect(reference.startsWith('DHO-2026-')).toBe(true);
  });

  it('omits the ambiguous characters I, L, O and U', () => {
    const suffixes = Array.from({ length: 500 }, () => generateReferenceSuffix());
    for (const suffix of suffixes) {
      expect(suffix).not.toMatch(/[ILOU]/);
      for (const character of suffix) expect(REFERENCE_ALPHABET).toContain(character);
    }
  });

  it('draws from the alphabet without obvious bias', () => {
    const counts = new Map();
    for (let i = 0; i < 2000; i += 1) {
      for (const character of generateReferenceSuffix()) {
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
    }
    // Every symbol should appear; 12000 draws over 32 symbols averages 375 each.
    expect(counts.size).toBe(REFERENCE_ALPHABET.length);
    for (const count of counts.values()) expect(count).toBeGreaterThan(200);
  });

  it('produces a keyspace large enough that guessing is impractical', () => {
    expect(REFERENCE_KEYSPACE).toBe(32 ** 6);
    expect(REFERENCE_KEYSPACE).toBeGreaterThan(1e9);
  });

  it('does not repeat within a large sample', () => {
    const generated = new Set(Array.from({ length: 5000 }, () => generateReferenceSuffix()));
    expect(generated.size).toBe(5000);
  });
});

describe('reference number normalisation', () => {
  it('accepts the canonical form', () => {
    expect(normalizeReferenceInput('DHO-2026-A7K2M9')).toBe('DHO-2026-A7K2M9');
  });

  it('accepts lowercase, spaces and missing dashes from a kiosk keypad', () => {
    expect(normalizeReferenceInput('dho 2026 a7k2m9')).toBe('DHO-2026-A7K2M9');
    expect(normalizeReferenceInput('2026A7K2M9')).toBe('DHO-2026-A7K2M9');
  });

  it('corrects the characters a citizen most often mistypes', () => {
    // O -> 0 and I/L -> 1 are the readings a person gives to the printed glyphs.
    expect(normalizeReferenceInput('DHO-2026-A7KO M9'.replace(' ', ''))).toBe('DHO-2026-A7K0M9');
    expect(normalizeReferenceInput('DHO-2026-AIK2M9')).toBe('DHO-2026-A1K2M9');
  });

  it('rejects anything of the wrong shape', () => {
    expect(normalizeReferenceInput('')).toBe('');
    expect(normalizeReferenceInput('DHO-2026-SHORT')).toBe('');
    expect(normalizeReferenceInput('nonsense')).toBe('');
    expect(normalizeReferenceInput(null)).toBe('');
  });
});
