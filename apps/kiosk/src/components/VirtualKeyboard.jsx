import { useState } from 'react';

import { useI18n } from '../i18n/index.js';

/**
 * On-screen keyboard.
 *
 * A physical keyboard cannot be assumed on a public kiosk. This component is the
 * integration layer: a screen passes the value and a setter, and the keyboard
 * edits that value directly. It does not simulate key events, because synthetic
 * events are unreliable across browsers and invisible to React's controlled
 * inputs.
 *
 * Every key is a real <button> at the 56px minimum, so switch access and screen
 * readers work without a custom widget role.
 */

const LATIN_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-'],
];

const ARABIC_ROWS = [
  ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ﻻ', 'ى', 'ة', 'و', 'ز', 'ظ', 'د'],
];

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['0'],
];

export const KEYBOARD_LAYOUT = Object.freeze({ TEXT: 'text', DIGITS: 'digits' });

export default function VirtualKeyboard({ value, onChange, layout = KEYBOARD_LAYOUT.TEXT, onDone, maxLength }) {
  const { t, locale } = useI18n();
  const [script, setScript] = useState(locale === 'ar' ? 'ar' : 'latin');

  const rows =
    layout === KEYBOARD_LAYOUT.DIGITS ? DIGIT_ROWS : script === 'ar' ? ARABIC_ROWS : LATIN_ROWS;

  const append = (char) => {
    if (maxLength && value.length >= maxLength) return;
    onChange(`${value}${char}`);
  };

  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="keyboard" role="group" aria-label={t('keyboard.show')}>
      {rows.map((row, rowIndex) => (
        <div className="keyboard__row" key={`row-${rowIndex}`}>
          {row.map((key) => (
            <button
              type="button"
              key={key}
              className="keyboard__key"
              // Keeps focus in the text field so the caret does not jump away.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => append(key)}
            >
              {key}
            </button>
          ))}
        </div>
      ))}

      <div className="keyboard__row">
        {layout === KEYBOARD_LAYOUT.TEXT && (
          <>
            <button
              type="button"
              className="keyboard__key keyboard__key--wide"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setScript((current) => (current === 'ar' ? 'latin' : 'ar'))}
            >
              {script === 'ar' ? t('keyboard.switchToLatin') : t('keyboard.switchToArabic')}
            </button>
            <button
              type="button"
              className="keyboard__key keyboard__key--wide"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => append(' ')}
            >
              {t('keyboard.space')}
            </button>
          </>
        )}
        <button
          type="button"
          className="keyboard__key keyboard__key--wide"
          onMouseDown={(event) => event.preventDefault()}
          onClick={backspace}
        >
          {t('keyboard.backspace')}
        </button>
        <button
          type="button"
          className="keyboard__key keyboard__key--wide"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange('')}
        >
          {t('keyboard.clear')}
        </button>
        {onDone && (
          <button
            type="button"
            className="keyboard__key keyboard__key--wide"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onDone}
          >
            {t('keyboard.done')}
          </button>
        )}
      </div>
    </div>
  );
}
