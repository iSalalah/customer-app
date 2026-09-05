import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * QR code for the public tracking URL.
 *
 * Rendered as inline SVG rather than a remote image: the reference number must
 * not be sent to a third-party QR service, and an inline SVG survives the strict
 * CSP with no img-src exception.
 *
 * The printed reference number is the authoritative artefact; if encoding ever
 * fails, the receipt is still complete without this component.
 */
export default function QrCode({ value, size = 220, title }) {
  const [markup, setMarkup] = useState(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size,
      color: { dark: '#000000ff', light: '#ffffffff' },
    })
      .then((svg) => {
        if (!cancelled) setMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setMarkup(null);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!markup) return null;

  return (
    <div
      className="receipt__qr"
      role="img"
      aria-label={title ?? value}
      // The markup is produced locally by the QR encoder from a URL this app
      // built itself - no user-supplied content reaches it.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
