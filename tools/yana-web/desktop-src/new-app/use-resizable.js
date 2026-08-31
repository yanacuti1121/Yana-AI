// Small drag-to-resize hook — no new dependency (react-resizable-panels
// etc. would be overkill for "drag a handle, persist a size"). One hook,
// reused for the sidebar width, context panel width, and terminal dock
// height (Phase 1's three resizable panels).
import React from 'react';

const DEFAULT_MIN = 120;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function useResizable({ storageKey, initial, min = DEFAULT_MIN, max, axis = 'x', direction = 1 }) {
  const [size, setSize] = React.useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0
      ? clamp(stored, min, max)
      : clamp(initial, min, max);
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
      // A handle on the left edge of a right-hand panel grows when dragged
      // left, while a handle on the right edge of a left-hand panel grows
      // when dragged right. `direction` expresses that physical relation
      // explicitly instead of relying on callers to encode it in a size.
      const delta = pos - startPos;
      const next = clamp(startSize + (direction * delta), min, max);
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
  }, [axis, direction, max, min, size, storageKey]);

  return { size, onDragStart };
}
