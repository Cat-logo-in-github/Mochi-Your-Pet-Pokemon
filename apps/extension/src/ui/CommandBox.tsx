import { useState } from 'react';
import type { GoogleWorkflowPlan } from '@mochi/shared';
import { parseCommand } from '@mochi/shared';
export function CommandBox({
  run,
  shortcuts,
  confirmGoogle,
}: {
  run: (text: string) => Promise<boolean>;
  shortcuts: Record<string, string>;
  confirmGoogle?: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ text: string; plan: GoogleWorkflowPlan } | null>(null);
  const intent = parseCommand(text, Date.now(), shortcuts);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (intent.kind === 'google-workflow' && confirmGoogle) {
      setReview({ text, plan: intent.plan });
      return;
    }
    setBusy(true);
    try {
      if (await run(text)) setText('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="command-box" onSubmit={submit}>
      <label htmlFor="mochi-command">A little help, one command away</label>
      <div className="command-input">
        <span aria-hidden="true">✦</span>
        <input
          id="mochi-command"
          maxLength={500}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setReview(null);
          }}
          placeholder="Remind me in 10 minutes to stretch"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Run command">
          {busy ? '…' : '↗'}
        </button>
      </div>
      {text && (
        <small className="command-preview">
          {intent.kind === 'navigate'
            ? `${intent.label} · ${new URL(intent.url).hostname}`
            : intent.kind === 'reminder'
              ? `${intent.openUrlOnDue && intent.url ? `Will open ${new URL(intent.url).hostname}` : 'Reminder'}: ${new Date(intent.dueAt).toLocaleString()}`
              : intent.kind === 'google-workflow'
                ? `${intent.plan.title} · review required`
                : intent.kind === 'clarify'
                  ? intent.message
                  : 'Ready when you are. Press Enter.'}
        </small>
      )}
      {review && (
        <section
          className="google-workflow-review notice"
          role="region"
          aria-label="Review Google action"
        >
          <strong>{review.plan.title}</strong>
          <p>{review.plan.description}</p>
          <small>
            Destination: {new URL(review.plan.url).hostname}. No additional Google permissions are
            requested.
          </small>
          <div className="button-row">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (await confirmGoogle?.(review.text)) {
                    setText('');
                    setReview(null);
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              {review.plan.action === 'compose-mail'
                ? 'Open Gmail draft'
                : review.plan.action === 'create-event'
                  ? 'Open Calendar editor'
                  : 'Open Google view'}
            </button>
            <button type="button" onClick={() => setReview(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
