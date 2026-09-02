// Slack connector OAuth — Connect/Disconnect + a live preview fetch.
// No refresh handling (Slack bot tokens don't expire without token
// rotation, which this integration doesn't use — see slack-oauth.js's
// header comment), so this hook is closer to use-github-connector.js's
// shape than use-google-connector.js's, except Slack DOES have a real
// revoke endpoint GitHub also has, unlike Notion which has none.
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const CONNECTOR_NAME = 'slack';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export function useSlackConnector() {
  const [status, setStatus] = React.useState(() => connectorCredentialStatus(CONNECTOR_NAME));
  const [identity, setIdentity] = React.useState(() => getConnectorCredential(CONNECTOR_NAME)?.email || null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const pollRef = React.useRef(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshStatus = React.useCallback(() => {
    setStatus(connectorCredentialStatus(CONNECTOR_NAME));
    setIdentity(getConnectorCredential(CONNECTOR_NAME)?.email || null);
  }, []);

  const connect = React.useCallback(async () => {
    setError(null);
    setBusy(true);
    stopPolling();
    try {
      const startRes = await fetch('/api/connectors/slack/start');
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/slack/pending/${startJson.state}`);
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
      if (bundle?.accessToken) {
        // Best-effort, same as GitHub/Google: local state clears
        // regardless of whether Slack's own revoke call succeeds.
        await fetch('/api/connectors/slack/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: bundle.accessToken }),
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
      const res = await fetch('/api/connectors/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: bundle.accessToken, limit: 5 }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.reconnectRequired) clearConnectorCredential(CONNECTOR_NAME);
        refreshStatus();
        setPreview({ items: null, loading: false, error: json.error || 'Could not load.' });
        return;
      }
      refreshStatus();
      setPreview({ items: json.channels || [], loading: false, error: null });
    } catch (err) {
      setPreview({ items: null, loading: false, error: err.message || 'Network error.' });
    }
  }, [refreshStatus]);

  return { status, identity, busy, error, connect, disconnect, preview, fetchPreview };
}
