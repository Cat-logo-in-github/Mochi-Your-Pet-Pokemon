import { useState } from 'react';
import { request } from '../client';
export function NotificationStatus({
  permission,
}: {
  permission: 'granted' | 'denied' | 'unknown';
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="notice notification-status" aria-label="Reminder notification setup">
      <strong>
        {permission === 'granted'
          ? 'Browser notifications are allowed'
          : permission === 'denied'
            ? 'Browser notifications are blocked'
            : 'Check reminder notifications'}
      </strong>
      <p>
        Calendar event and local reminders use system notifications even when no web page is open.
        Enable notifications for this browser in Windows settings. Browser sleep or a closed browser
        can delay reminders.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await request({ type: 'notification-test' });
            setMessage(result.ok ? result.message || 'Test sent.' : result.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        Send test notification
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
