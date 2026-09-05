/**
 * Session purge.
 *
 * When a citizen session ends - by logout, by idle expiry, or because the API
 * reported SESSION_EXPIRED - everything belonging to that citizen must leave the
 * browser before the next person touches the screen.
 *
 * Nothing sensitive is ever written to localStorage or sessionStorage in the
 * first place; they are cleared anyway, because "we never write there" is a
 * claim that must survive future edits by someone who did not read this comment.
 */
export function purgeSessionState(queryClient) {
  if (queryClient) {
    // Cancel in-flight requests so a late response cannot repopulate the cache
    // after the purge, then drop every cached page of citizen data.
    queryClient.cancelQueries();
    queryClient.clear();
  }

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // Private mode or a locked-down kiosk profile can throw; nothing was stored.
  }

  // Object URLs created for file previews hold the file bytes in memory.
  revokeTrackedObjectUrls();
}

const trackedObjectUrls = new Set();

export function trackObjectUrl(url) {
  trackedObjectUrls.add(url);
  return url;
}

export function revokeTrackedObjectUrls() {
  for (const url of trackedObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Already revoked.
    }
  }
  trackedObjectUrls.clear();
}

/**
 * Replaces the history entry and traps Back.
 *
 * Without this, pressing Back after a session ends re-renders the previous
 * citizen's screen from the SPA's own history state, even though the API would
 * refuse the next data call. The trap pushes the home entry back on top.
 */
export function resetHistoryToHome() {
  try {
    window.history.replaceState(null, '', '/');
    window.history.pushState(null, '', '/');
  } catch {
    // Some kiosk browsers restrict history manipulation; navigation still works.
  }
}
