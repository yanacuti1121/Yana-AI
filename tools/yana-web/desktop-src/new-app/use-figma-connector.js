// Figma connector OAuth — Connect/Disconnect only, no Preview button:
// figma-oauth.js's header comment explains why (no generic "list my
// files" endpoint exists without a pre-known team_id). Has a real
// refresh flow (unlike GitHub) folded back into YanaVault on the next
// successful call — but since there's no preview call here to trigger
// that fold-back, refresh only ever happens implicitly the next time
// this connector's stored token is used by something else that does
// call through connectorFetchWithRefresh. connectorCredentialStatus()
// already treats an unrefreshed-but-expired bundle as 'expired', so the
// panel still shows Reconnect correctly even without its own preview call.
import React from 'react';
import {
  getConnectorCredential,
  setConnectorCredential,
  clearConnectorCredential,
  connectorCredentialStatus,
} from '../lib/connector-credentials.mjs';

const CONNECTOR_NAME = 'figma';
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60_000;

export function useFigmaConnector() {
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
      const startRes = await fetch('/api/connectors/figma/start');
      const startJson = await startRes.json();
      if (!startRes.ok || !startJson.ok) throw new Error(startJson.error || 'Could not start the connection.');

      window.open(startJson.authUrl, '_blank', 'noopener');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      await new Promise((resolve, reject) => {
        pollRef.current = setInterval(async () => {
          if (Date.now() > deadline) { stopPolling(); reject(new Error('Timed out waiting for the connection. Try again.')); return; }
          let pendJson;
          try {
            const pendRes = await fetch(`/api/connectors/figma/pending/${startJson.state}`);
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

  // No revoke call: figma-oauth.js documents there is no Figma API
  // endpoint for it — same situation as Notion. Disconnect is local-only.
  const disconnect = React.useCallback(() => {
    clearConnectorCredential(CONNECTOR_NAME);
    refreshStatus();
  }, [refreshStatus]);

  return { status, identity, busy, error, connect, reconnect: connect, disconnect };
}
