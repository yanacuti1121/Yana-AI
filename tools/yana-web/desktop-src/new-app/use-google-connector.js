// Google connector OAuth — Connect/Connected/Expired/Reconnect/Disconnect
// lifecycle for a single connector (gmail | google-calendar). Talks to
// connector-oauth.js's routes and stores the result via
// lib/connector-credentials.mjs (YanaVault-backed) — never touches
// connector-registry.js's Rust-driven local-permission state, which stays
// a completely separate gate (see connector-oauth.js's header comment).
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;
const PREVIEW_ROUTES = {
  gmail: { path: '/api/connectors/gmail/messages', itemsKey: 'messages' },
  'google-calendar': { path: '/api/connectors/calendar/events', itemsKey: 'events' },
  'google-drive': { path: '/api/connectors/drive/files', itemsKey: 'files' },
};

export function useGoogleConnector(connectorName) {
  const [status, setStatus] = React.useState(() => connectorCredentialStatus(connectorName));
  const [email, setEmail] = React.useState(() => getConnectorCredential(connectorName)?.email || null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const pollRef = React.useRef(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshStatus = React.useCallback(() => {
    setStatus(connectorCredentialStatus(connectorName));
    setEmail(getConnectorCredential(connectorName)?.email || null);
  }, [connectorName]);

  // Same function serves both "Connect" (nothing stored yet) and
  // "Reconnect" (expired, or the user wants to re-grant) — Google's
  // consent screen with prompt=consent handles both identically from the
  // OAuth side; there is no separate reconnect flow to build.
  const connect = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    stopPolling();
    try {
      const startRes = await fetch(`/api/connectors/google/start?connector=${encodeURIComponent(connectorName)}`);
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      // Electron's guardNavigation/setWindowOpenHandler routes this to the
      // system browser (external origin) — this is the SAME path the
      // login OAuth button already relies on, not new plumbing.
      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/google/pending/${startJson.state}`);
            pendJson = await pendRes.json();
          } catch (_) {
            return; // transient network hiccup — keep polling until the deadline
          }
          if (!pendJson.ok || pendJson.status === 'pending') return;
          stopPolling();
          if (pendJson.status === 'error') { reject(new Error('The connection was not completed.')); return; }
          try {
            await setConnectorCredential(connectorName, pendJson.tokens);
            resolve();
          } catch (err) {
            reject(err);
          }
        }, POLL_INTERVAL_MS);
      });
      refreshStatus();
    } catch (err) {
      setError(err.message || 'Connection failed.');
    } finally {
      setBusy(false);
    }
  }, [connectorName, refreshStatus, stopPolling]);

  const disconnect = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const bundle = getConnectorCredential(connectorName);
      const tokenToRevoke = bundle?.refreshToken || bundle?.accessToken;
      if (tokenToRevoke) {
        // Best-effort: local state is cleared regardless of whether Google's
        // revoke call succeeds — a failed revoke must never leave the UI
        // stuck showing "Connected" for a credential the user just removed.
        await fetch('/api/connectors/google/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenToRevoke }),
        }).catch(() => {});
      }
    } finally {
      clearConnectorCredential(connectorName);
      refreshStatus();
      setBusy(false);
    }
  }, [connectorName, refreshStatus]);

  // Fetches a short live preview (recent Gmail messages / Calendar events)
  // through the server-side adapter — the actual "does this real API call
  // work" proof, distinct from everything the OAuth lifecycle above can
  // verify on its own. Folds a transparent access-token refresh back into
  // YanaVault when the server performed one (see server.js's
  // connectorFetchWithRefresh); clears the stored credential entirely if
  // the server reports the refresh token itself is no longer valid, so the
  // UI falls back to a clean "Connect" rather than a stuck dead "expired".
  const [preview, setPreview] = React.useState({ items: null, loading: false, error: null });

  const fetchPreview = React.useCallback(async () => {
    const route = PREVIEW_ROUTES[connectorName];
    if (!route) return;
    const bundle = getConnectorCredential(connectorName);
    if (!bundle?.accessToken) { setPreview({ items: null, loading: false, error: 'Not connected.' }); return; }
    setPreview({ items: null, loading: true, error: null });
    try {
      const res = await fetch(route.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: bundle.accessToken, refreshToken: bundle.refreshToken, limit: 5 }),
      });
      const json = await res.json();
      if (json.refreshedToken) {
        await setConnectorCredential(connectorName, { ...bundle, accessToken: json.refreshedToken.accessToken, expiresAt: json.refreshedToken.expiresAt });
      }
      if (!json.ok) {
        if (json.reconnectRequired) { clearConnectorCredential(connectorName); }
        refreshStatus();
        setPreview({ items: null, loading: false, error: json.error || 'Could not load.' });
        return;
      }
      refreshStatus();
      setPreview({ items: json[route.itemsKey] || [], loading: false, error: null });
    } catch (err) {
      setPreview({ items: null, loading: false, error: err.message || 'Network error.' });
    }
  }, [connectorName, refreshStatus]);

  return { status, email, busy, error, connect, reconnect: connect, disconnect, preview, fetchPreview };
}
