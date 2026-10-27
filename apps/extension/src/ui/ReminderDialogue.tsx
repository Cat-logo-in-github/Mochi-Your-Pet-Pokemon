import type { ReminderNotice } from '@mochi/shared';
export function ReminderDialogue({
  notice,
  count = 1,
  busy = false,
  error = '',
  onSnooze,
  onDismiss,
  trustedOnly = false,
}: {
  notice: ReminderNotice;
  count?: number;
  busy?: boolean;
  error?: string;
  onSnooze: () => void;
  onDismiss: () => void;
  trustedOnly?: boolean;
}) {
  return (
    <section
      className="reminder-dialogue"
      role="dialog"
      aria-label="Reminder from Mochi"
      aria-live="polite"
    >
      <div className="reminder-dialogue-heading">
        <strong>MOCHI REMINDS YOU</strong>
        {count > 1 && <span>{count} waiting</span>}
      </div>
      <p className="reminder-dialogue-title">{notice.title}</p>
      <p className="reminder-dialogue-time">
        {new Date(notice.dueAt).toLocaleString(undefined, {
          timeZone: notice.timeZone,
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </p>
      <div className="reminder-dialogue-actions">
        <button
          disabled={busy}
          onClick={(e) => {
            if (!trustedOnly || e.isTrusted) onSnooze();
          }}
        >
          Snooze 5 minutes
        </button>
        <button
          disabled={busy}
          onClick={(e) => {
            if (!trustedOnly || e.isTrusted) onDismiss();
          }}
        >
          Dismiss
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice.urlOpenStatus && (
        <p className="fine">
          {notice.urlOpenStatus === 'opened'
            ? 'Linked page opened in a new tab.'
            : 'The linked page could not open. Use the link below.'}
        </p>
      )}
      {notice.url && (
        <a
          href={notice.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (trustedOnly && !e.isTrusted) e.preventDefault();
          }}
        >
          Open linked page
        </a>
      )}
    </section>
  );
}
