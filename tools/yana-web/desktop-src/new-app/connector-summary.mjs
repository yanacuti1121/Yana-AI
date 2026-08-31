function stateOf(connector) {
  if (typeof connector?.connectionState === 'string') return connector.connectionState.toLowerCase();
  if (typeof connector?.status === 'string') return connector.status.toLowerCase();
  return 'unknown';
}

export function summarizeConnections(connectors) {
  const summary = { total: 0, ready: 0, attention: 0 };
  if (!Array.isArray(connectors)) return summary;

  for (const connector of connectors) {
    summary.total += 1;
    const state = stateOf(connector);
    if (state === 'ready') summary.ready += 1;
    if (state === 'credential-required' || state === 'adapter-unavailable' || state === 'error' || state === 'failed') {
      summary.attention += 1;
    }
  }
  return summary;
}
