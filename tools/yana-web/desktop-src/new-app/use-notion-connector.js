// Notion connector OAuth — Connect/Disconnect + a live preview fetch,
// same YanaVault-backed lifecycle shape as use-google-connector.js
// (Notion issues a refresh_token, unlike GitHub — see notion-oauth.js's
// header comment). No Reconnect state: Notion's "Connect" flow already
// re-runs the same page-picker consent screen every time, so a second
// Connect after Expired IS the reconnect, matching how
// use-github-connector.js's connect() doubles as its own reconnect too.
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const CONNECTOR_NAME = 'notion';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export function useNotionConnector() {
  const [status, setStatus] = React.useState(() => connectorCredentialStatus(CONNECTOR_NAME));
  const [identity, setIdentity] = React.useState(() => getConnectorCredential(CONNECTOR_NAME)?.workspaceName || null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const pollRef = React.useRef(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshStatus = React.useCallback(() => {
    setStatus(connectorCredentialStatus(CONNECTOR_NAME));
    setIdentity(getConnectorCredential(CONNECTOR_NAME)?.workspaceName || null);
  }, []);

  const connect = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    stopPolling();
    try {
      const startRes = await fetch('/api/connectors/notion/start');
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/notion/pending/${startJson.state}`);
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

  // No revoke call: notion-oauth.js documents there is no Notion API
  // endpoint for it. Disconnect only ever clears the local credential —
  // the user's own Notion workspace settings are the real place to
  // remove the integration's access entirely.
  const disconnect = React.useCallback(() => {
    clearConnectorCredential(CONNECTOR_NAME);
    refreshStatus();
  }, [refreshStatus]);

  const [preview, setPreview] = React.useState({ items: null, loading: false, error: null });

  const fetchPreview = React.useCallback(async () => {
    const bundle = getConnectorCredential(CONNECTOR_NAME);
    if (!bundle?.accessToken) { setPreview({ items: null, loading: false, error: 'Not connected.' }); return; }
    setPreview({ items: null, loading: true, error: null });
    try {
      const res = await fetch('/api/connectors/notion/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: bundle.accessToken, refreshToken: bundle.refreshToken, limit: 5 }),
      });
      const json = await res.json();
      if (json.refreshedToken) {
        await setConnectorCredential(CONNECTOR_NAME, {
          ...bundle,
          accessToken: json.refreshedToken.accessToken,
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
      setPreview({ items: json.pages || [], loading: false, error: null });
    } catch (err) {
      setPreview({ items: null, loading: false, error: err.message || 'Network error.' });
    }
  }, [refreshStatus]);

  return { status, identity, busy, error, connect, disconnect, preview, fetchPreview };
}
