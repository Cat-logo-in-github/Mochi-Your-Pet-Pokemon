import { useCallback, useEffect, useState } from 'react';
import { request, subscribe } from '../client';
import type { AppData, Settings, ReminderNotice } from '@mochi/shared';
import type { GoogleStatus, Message } from '../protocol';
export function useMochi() {
  const [pendingReminders, setPendingReminders] = useState<ReminderNotice[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    'granted' | 'denied' | 'unknown'
  >('unknown');
  const [windowId, setWindowId] = useState('default');
  const [data, setData] = useState<AppData | null>(null),
    [google, setGoogle] = useState<GoogleStatus | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const send = useCallback(async (message: Message) => {
    const result = await request(message);
    if (!result?.ok) {
      setError(result?.error || 'Mochi could not respond. Reload the extension.');
      return false;
    }
    setError('');
    if (result.windowId) setWindowId(result.windowId);
    setData(result.data);
    setPendingReminders(result.pendingReminders || []);
    setNotificationPermission(result.notificationPermission || 'unknown');
    setGoogle(result.google);
    if (result.message) setNotice(result.message);
    return true;
  }, []);
  useEffect(() => {
    void send({ type: 'get' });
    const unsubscribe = subscribe(setData, () => {
      void send({ type: 'get' });
    });
    const refresh = () => {
      if (!document.hidden) void send({ type: 'get' });
    };
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [send]);
  const patch = useCallback(
    (patch: Partial<Settings>) => send({ type: 'settings', patch }),
    [send],
  );
  return {
    data,
    google,
    error,
    notice,
    setNotice,
    send,
    patch,
    windowId,
    pendingReminders,
    notificationPermission,
  };
}
