// Yana AI — Chat: probe local providers (Ollama/9router/LM Studio/
// TurboFieldfare) on mount.
import React from 'react';

export function useLocalStatus(setProviderSel) {
  const [localStatus, setLocalStatus] = React.useState(null); // null=unknown, {}=probed

  React.useEffect(() => {
    fetch("/api/local-status")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setLocalStatus(data);
        // If user hasn't picked a provider yet, auto-select the first running
        // local one — turbofieldfare first since it's the strongest model.
        if (!localStorage.getItem("yana.chat.provider")) {
          const first = ["turbofieldfare", "ollama", "9router", "lmstudio"].find(id => data[id]?.running);
          if (first) setProviderSel(first);
        }
      })
      .catch(() => {});
  }, []);

  return localStatus;
}
