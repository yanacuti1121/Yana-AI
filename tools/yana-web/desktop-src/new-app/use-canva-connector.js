// Canva connector OAuth — full lifecycle (Connect/Reconnect/Disconnect
// with real revoke + a live preview fetch with real refresh), the same
// shape as use-google-connector.js. One real difference folded in here:
// Canva rotates its refresh_token on every use (canva-oauth.js's header
// comment — "each refresh token can only be used once"), so fetchPreview
// below persists refreshedToken.refreshToken back into YanaVault when
// present, not just the access token the Google-family hook only had to
// handle.
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const CONNECTOR_NAME = 'canva';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export function useCanvaConnector() {
  const [status, setStatus] = React.useState(() => connectorCredentialStatus(CONNECTOR_NAME));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const pollRef = React.useRef(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshStatus = React.useCallback(() => {
    setStatus(connectorCredentialStatus(CONNECTOR_NAME));
  }, []);

  const connect = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    stopPolling();
    try {
      const startRes = await fetch('/api/connectors/canva/start');
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/canva/pending/${startJson.state}`);
            pendJson = await pendRes.json();
          } catch (_) {
            return;
          }
          if (!pendJson.ok || pendJson.status === 'pending') return;
          stopPolling();
          if (pendJson.status === 'error') { reject(new Error('The connection was not completed.')); return; }
          try {
            await setConnectorCredential(CONNECTOR_NAME, pendJson.tokens);
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
  }, [refreshStatus, stopPolling]);

  const disconnect = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const bundle = getConnectorCredential(CONNECTOR_NAME);
      const tokenToRevoke = bundle?.refreshToken || bundle?.accessToken;
      if (tokenToRevoke) {
        await fetch('/api/connectors/canva/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenToRevoke }),
        }).catch(() => {});
      }
    } finally {
      clearConnectorCredential(CONNECTOR_NAME);
      refreshStatus();
      setBusy(false);
    }
  }, [refreshStatus]);

  const [preview, setPreview] = React.useState({ items: null, loading: false, error: null });

  const fetchPreview = React.useCallback(async () => {
    const bundle = getConnectorCredential(CONNECTOR_NAME);
    if (!bundle?.accessToken) { setPreview({ items: null, loading: false, error: 'Not connected.' }); return; }
    setPreview({ items: null, loading: true, error: null });
    try {
      const res = await fetch('/api/connectors/canva/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: bundle.accessToken, refreshToken: bundle.refreshToken, limit: 5 }),
      });
      const json = await res.json();
      if (json.refreshedToken) {
        await setConnectorCredential(CONNECTOR_NAME, {
          ...bundle,
          accessToken: json.refreshedToken.accessToken,
          expiresAt: json.refreshedToken.expiresAt,
          // Canva rotates refresh tokens — the old one stops working the
          // moment a new one is issued, so this MUST overwrite, not
          // merely fall back like the Google-family hook's optional case.
          refreshToken: json.refreshedToken.refreshToken || bundle.refreshToken,
        });
      }
      if (!json.ok) {
        if (json.reconnectRequired) clearConnectorCredential(CONNECTOR_NAME);
        refreshStatus();
        setPreview({ items: null, loading: false, error: json.error || 'Could not load.' });
        return;
      }
      refreshStatus();
      setPreview({ items: json.designs || [], loading: false, error: null });
    } catch (err) {
      setPreview({ items: null, loading: false, error: err.message || 'Network error.' });
    }
  }, [refreshStatus]);

  return { status, busy, error, connect, reconnect: connect, disconnect, preview, fetchPreview };
}
