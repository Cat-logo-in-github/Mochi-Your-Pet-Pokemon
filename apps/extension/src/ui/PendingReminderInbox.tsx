import { useState } from 'react';
import type { ReminderNotice } from '@mochi/shared';
import type { Message } from '../protocol';
import { ReminderDialogue } from './ReminderDialogue';
export function PendingReminderInbox({
  notices,
  send,
}: {
  notices: ReminderNotice[];
  send: (message: Message) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  if (!notices.length) return null;
  const notice = notices[0];
  async function handle(action: 'snooze' | 'dismiss') {
    if (busy) return;
    setBusy(true);
    try {
      await send({
        type: 'reminder-action',
        id: notice.reminderId,
        deliveryId: notice.deliveryId,
        action,
        ...(action === 'snooze' ? { minutes: 5 } : {}),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pending-reminder-inbox">
      <ReminderDialogue
        notice={notice}
        count={notices.length}
        busy={busy}
        onSnooze={() => void handle('snooze')}
        onDismiss={() => void handle('dismiss')}
      />
    </div>
  );
}
