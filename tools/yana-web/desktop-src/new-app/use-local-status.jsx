import React from 'react';
import { firstRunningLocalProvider } from './local-provider-config.mjs';

export function useNewAppLocalStatus(setProviderSel) {
  const [localStatus, setLocalStatus] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/local-status')
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (!status) return;
        setLocalStatus(status);
        if (!localStorage.getItem('yana.chat.provider')) {
          const providerId = firstRunningLocalProvider(status);
          if (providerId) setProviderSel(providerId);
        }
      })
      .catch(() => {});
  }, [setProviderSel]);

  return localStatus;
}
