// Small drag-to-resize hook — no new dependency (react-resizable-panels
// etc. would be overkill for "drag a handle, persist a size"). One hook,
// reused for the sidebar width, context panel width, and terminal dock
// height (Phase 1's three resizable panels).
import React from 'react';

const MIN = 120;

export function useResizable({ storageKey, initial, max, axis = 'x' }) {
  const [size, setSize] = React.useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : initial;
  });
  const draggingRef = React.useRef(false);

  const onDragStart = React.useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    const startPos = axis === 'x' ? e.clientX : e.clientY;
    const startSize = size;

    function onMove(moveEvent) {
      if (!draggingRef.current) return;
      const pos = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
      // Sidebar/context panel grow as the mouse moves away from the
      // workspace center — direction depends on which edge the handle
      // sits on, so callers pass a signed initial/max instead of this
      // hook guessing left vs right edges.
      const delta = pos - startPos;
      const next = Math.min(max, Math.max(MIN, startSize + delta));
      setSize(next);
    }
    function onUp() {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setSize((current) => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [axis, max, size, storageKey]);

  return { size, onDragStart };
}
