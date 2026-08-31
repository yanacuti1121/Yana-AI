export function activateTerminalSession(layout, key) {
  if (!layout || !Array.isArray(layout.sessions) || !layout.sessions.some((session) => session.key === key)) {
    return layout;
  }
  if (layout.activeKey === key) return layout;
  return { ...layout, activeKey: key };
}
