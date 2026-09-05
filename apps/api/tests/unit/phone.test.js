import { formatNationalForDisplay, isValidOmanPhone, maskPhone, normalizeOmanPhone } from '@dhofar/shared';

describe('Oman phone normalisation', () => {
  it.each([
    ['91234567', '+96891234567'],
    ['71234567', '+96871234567'],
    ['+96891234567', '+96891234567'],
    ['96891234567', '+96891234567'],
    ['0096891234567', '+96891234567'],
    ['+968 9123 4567', '+96891234567'],
    ['968-9123-4567', '+96891234567'],
    ['091234567', '+96891234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeOmanPhone(input)).toBe(expected);
  });

  it('accepts Arabic-Indic digits, which a kiosk keypad may produce', () => {
    expect(normalizeOmanPhone('٩١٢٣٤٥٦٧')).toBe('+96891234567');
    expect(normalizeOmanPhone('۹۱۲۳۴۵۶۷')).toBe('+96891234567');
  });

  it.each([
    ['', 'empty'],
    ['1234', 'too short'],
    ['912345678', 'too long'],
    ['81234567', 'not a mobile prefix'],
    ['+97141234567', 'not an Oman number'],
    ['abcdefgh', 'not numeric'],
    [null, 'null'],
    [undefined, 'undefined'],
    [12345678, 'a number rather than a string'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeOmanPhone(input)).toBeNull();
    expect(isValidOmanPhone(input)).toBe(false);
  });

  it('never throws on hostile input', () => {
    expect(() => normalizeOmanPhone({ toString: () => '91234567' })).not.toThrow();
    expect(() => normalizeOmanPhone([])).not.toThrow();
  });
});

describe('phone masking', () => {
  it('hides the middle digits', () => {
    const masked = maskPhone('+96891234567');
    expect(masked.startsWith('+9689')).toBe(true);
    expect(masked.endsWith('567')).toBe(true);
    expect(masked).not.toBe('+96891234567');
    expect(masked).toContain('*');
  });

  it('degrades safely for malformed input', () => {
    expect(maskPhone('')).toBe('***');
    expect(maskPhone(null)).toBe('***');
    expect(maskPhone('123')).toBe('***');
  });
});

describe('display formatting', () => {
  it('groups the national number for readability', () => {
    expect(formatNationalForDisplay('+96891234567')).toBe('9123 4567');
  });

  it('returns an empty string rather than partial output', () => {
    expect(formatNationalForDisplay('123')).toBe('');
  });
});
