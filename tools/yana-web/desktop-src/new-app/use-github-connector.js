// GitHub connector OAuth — Connect/Disconnect lifecycle only. Unlike
// use-google-connector.js there is no Reconnect/Expired state (classic
// GitHub OAuth App tokens don't expire — see github-oauth.js's header
// comment) and no in-hook preview fetch: the actual GitHub data pull
// already exists as connector.rs's sync_github, driven by the existing
// "Preview sync" / "Sync to workspace" buttons in integrations-settings.jsx.
// This hook's only extra job beyond Connect/Disconnect is exposing the
// stored access token so those existing sync buttons can pass it through
// window.yana.connectorSync(name, { accessToken }) — see
// connector-registry.js's syncConnector for where that lands.
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const CONNECTOR_NAME = 'github';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export function useGithubConnector() {
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
      const startRes = await fetch('/api/connectors/github/start');
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/github/pending/${startJson.state}`);
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
        await fetch('/api/connectors/github/revoke', {
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

  return { status, identity, busy, error, connect, disconnect };
}

/** Reads the stored GitHub access token, if any — for the existing Sync buttons to pass into connectorSync(). */
export function getGithubAccessToken() {
  return getConnectorCredential(CONNECTOR_NAME)?.accessToken || null;
}
