import { useEffect, useState } from 'react';
import { pwaUpdateService, PWAUpdateState } from '../services/pwaUpdateService';

export function usePWAUpdate() {
  const [state, setState] = useState<PWAUpdateState>(() => pwaUpdateService.getState());

  useEffect(() => {
    pwaUpdateService.init();
    return pwaUpdateService.subscribe(setState);
  }, []);

  return {
    ...state,
    isStandalone: pwaUpdateService.isStandalone(),
    buildInfo: pwaUpdateService.getBuildInfo(),
    checkForUpdates: (force?: boolean) => pwaUpdateService.checkForUpdates(force),
    applyUpdate: () => pwaUpdateService.applyUpdate(),
    dismissNetworkNotice: () => pwaUpdateService.dismissNetworkNotice(),
  };
}
