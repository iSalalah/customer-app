import { generateOtpCode, hashOtpCode, verifyOtpCode } from '../../src/infra/crypto/otp.js';
import { safeEqualHex } from '../../src/infra/crypto/hash.js';

describe('OTP generation', () => {
  it('produces a code of the configured length, digits only', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtpCode(6);
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('is not constant across calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOtpCode(6)));
    // 200 draws from a 10^6 space should essentially never collide down to a
    // handful of values; anything under 150 distinct means the source is broken.
    expect(codes.size).toBeGreaterThan(150);
  });

  it('covers the whole digit range rather than a biased subset', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) {
      for (const digit of generateOtpCode(6)) seen.add(digit);
    }
    expect(seen.size).toBe(10);
  });
});

describe('OTP hashing', () => {
  const phone = '+96891234567';

  it('never returns the plaintext code', () => {
    const hash = hashOtpCode(phone, '123456');
    expect(hash).not.toContain('123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same phone, code and pepper', () => {
    expect(hashOtpCode(phone, '123456')).toBe(hashOtpCode(phone, '123456'));
  });

  it('binds the phone number into the digest', () => {
    // A hash captured for one number must not verify against another.
    expect(hashOtpCode('+96891234567', '123456')).not.toBe(hashOtpCode('+96899999999', '123456'));
  });

  it('changes completely when the pepper changes', () => {
    const a = hashOtpCode(phone, '123456', 'pepper-one-at-least-32-characters-long!!');
    const b = hashOtpCode(phone, '123456', 'pepper-two-at-least-32-characters-long!!');
    expect(a).not.toBe(b);
  });
});

describe('OTP verification', () => {
  const phone = '+96891234567';

  it('accepts the correct code', () => {
    const hash = hashOtpCode(phone, '654321');
    expect(verifyOtpCode(phone, '654321', hash)).toBe(true);
  });

  it('rejects an incorrect code', () => {
    const hash = hashOtpCode(phone, '654321');
    expect(verifyOtpCode(phone, '654322', hash)).toBe(false);
  });

  it('rejects the right code presented for a different phone number', () => {
    const hash = hashOtpCode(phone, '654321');
    expect(verifyOtpCode('+96899999999', '654321', hash)).toBe(false);
  });

  it('rejects empty and non-string codes without throwing', () => {
    const hash = hashOtpCode(phone, '654321');
    expect(verifyOtpCode(phone, '', hash)).toBe(false);
    expect(verifyOtpCode(phone, null, hash)).toBe(false);
    expect(verifyOtpCode(phone, undefined, hash)).toBe(false);
  });
});

describe('constant-time comparison', () => {
  it('returns false for differing lengths instead of throwing', () => {
    expect(safeEqualHex('abcd', 'abcdef')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(safeEqualHex('', '')).toBe(false);
  });

  it('matches identical digests', () => {
    const digest = hashOtpCode('+96891234567', '111111');
    expect(safeEqualHex(digest, digest)).toBe(true);
  });
});
