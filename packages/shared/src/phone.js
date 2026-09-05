/**
 * Oman phone-number normalisation.
 *
 * Accepts what a citizen would actually type on a kiosk keypad and produces a
 * single canonical E.164 form so that rate limits, OTP challenges and the
 * unique index on Citizen.phoneNumber all key on the same string.
 *
 * Oman mobile prefixes are 7 and 9, followed by 7 more digits (8 total).
 */

export const OMAN_COUNTRY_CODE = '968';
export const OMAN_MOBILE_PREFIXES = Object.freeze(['7', '9']);
const NATIONAL_LENGTH = 8;

/** Arabic-Indic and Eastern Arabic-Indic digits map to ASCII. */
const DIGIT_MAP = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Converts Arabic-Indic digits to ASCII and drops every non-digit. */
export function toAsciiDigits(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) {
    const mapped = DIGIT_MAP[ch] ?? ch;
    if (mapped >= '0' && mapped <= '9') out += mapped;
  }
  return out;
}

/**
 * @returns {string|null} canonical "+9689XXXXXXX", or null when not a valid
 * Oman mobile number. Never throws - callers decide the error shape.
 */
export function normalizeOmanPhone(input) {
  let digits = toAsciiDigits(input);
  if (!digits) return null;

  // 00968... international prefix
  if (digits.startsWith('00' + OMAN_COUNTRY_CODE)) {
    digits = digits.slice(2 + OMAN_COUNTRY_CODE.length);
  } else if (digits.startsWith(OMAN_COUNTRY_CODE) && digits.length === OMAN_COUNTRY_CODE.length + NATIONAL_LENGTH) {
    digits = digits.slice(OMAN_COUNTRY_CODE.length);
  } else if (digits.startsWith('0') && digits.length === NATIONAL_LENGTH + 1) {
    // Tolerate a leading trunk zero even though Oman does not use one.
    digits = digits.slice(1);
  }

  if (digits.length !== NATIONAL_LENGTH) return null;
  if (!OMAN_MOBILE_PREFIXES.includes(digits[0])) return null;

  return `+${OMAN_COUNTRY_CODE}${digits}`;
}

export function isValidOmanPhone(input) {
  return normalizeOmanPhone(input) !== null;
}

/**
 * "+96891234567" -> "+9689****567". Used in audit rows and any message a
 * citizen sees; a full number is never echoed back.
 */
export function maskPhone(normalized) {
  if (typeof normalized !== 'string' || normalized.length < 8) return '***';
  const head = normalized.slice(0, 5);
  const tail = normalized.slice(-3);
  return `${head}${'*'.repeat(Math.max(0, normalized.length - 8))}${tail}`;
}

/** Grouped for display on the kiosk: "9123 4567". Never used as a key. */
export function formatNationalForDisplay(normalized) {
  const national = toAsciiDigits(normalized).slice(-NATIONAL_LENGTH);
  if (national.length !== NATIONAL_LENGTH) return '';
  return `${national.slice(0, 4)} ${national.slice(4)}`;
}
