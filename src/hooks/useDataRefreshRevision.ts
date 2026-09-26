import { useEffect, useState } from 'react';

/** Re-query the open page's range AFTER background refreshes finish replacing caches. */
export function useDataRefreshRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevision(value => value + 1), 80);
    };
    window.addEventListener('business-data-refreshed', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('business-data-refreshed', refresh); };
  }, []);
  return revision;
}
