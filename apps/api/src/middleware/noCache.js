/**
 * Kiosk cache hygiene.
 *
 * The next citizen must not be able to reach the previous citizen's data by
 * pressing Back. Browsers will restore a cached authenticated page from the
 * back-forward cache unless the response says otherwise, so every authenticated
 * or otherwise sensitive response carries no-store.
 */
export function noCache(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
}

export default noCache;
