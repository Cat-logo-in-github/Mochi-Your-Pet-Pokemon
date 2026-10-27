import { useEffect, useState } from 'react';
import { loadDownloads, type DownloadState } from './downloads';
export function useDownloads() {
  const [state, setState] = useState<DownloadState>({
    status: 'loading',
    message: 'Checking the Windows download…',
  });
  useEffect(() => {
    const controller = new AbortController();
    const repository = typeof __MOCHI_REPOSITORY__ === 'string' ? __MOCHI_REPOSITORY__ : '';
    void loadDownloads(import.meta.env.BASE_URL, repository, fetch, controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) setState(next);
      },
    );
    return () => controller.abort();
  }, []);
  return state;
}
