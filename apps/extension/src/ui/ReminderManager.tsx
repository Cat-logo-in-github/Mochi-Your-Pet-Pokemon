import { useState } from 'react';
import { localTimeZone, parseLocalDateTime, safeUrl } from '@mochi/shared';
import type { Reminder } from '@mochi/shared';
import type { Message } from '../protocol';
function localInput(epoch: number, zone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epoch));
  return parts.replace(' ', 'T');
}
export function ReminderManager({
  reminders,
  catchUp,
  send,
}: {
  reminders: Reminder[];
  catchUp: Reminder[];
  send: (m: Message) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(''),
    [link, setLink] = useState(''),
    [openUrlOnDue, setOpenUrlOnDue] = useState(false),
    [zone, setZone] = useState(localTimeZone()),
    [when, setWhen] = useState(localInput(Date.now() + 600000, localTimeZone())),
    [repeat, setRepeat] = useState<Reminder['recurrence']>('none'),
    [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const dueAt = parseLocalDateTime(when, zone);
      if (dueAt === null || !Number.isFinite(dueAt) || dueAt < Date.now() - 60000)
        throw new Error('Choose a valid future date and an IANA timezone.');
      const url = link.trim() ? safeUrl(link.trim()) : null;
      if (link.trim() && !url) throw new Error('Use one complete http:// or https:// link.');
      if (openUrlOnDue && !url)
        throw new Error('Add a safe linked page before enabling automatic opening.');
      const prior = reminders.find((r) => r.id === editing);
      const reminder: Reminder = {
        ...prior,
        id: editing || crypto.randomUUID(),
        title: title.trim(),
        dueAt,
        timeZone: zone,
        recurrence: repeat,
        paused: false,
        completed: false,
        source: 'local',
        openUrlOnDue,
      };
      if (url) reminder.url = url;
      else delete reminder.url;
      delete reminder.lastDeliveredAt;
      delete reminder.recurrenceTime;
      if (!title.trim()) throw new Error('Give your reminder a title.');
      if (await send({ type: 'reminder-save', reminder })) {
        setTitle('');
        setLink('');
        setOpenUrlOnDue(false);
        setEditing(null);
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That time could not be saved.');
    }
  }
  function edit(r: Reminder) {
    setEditing(r.id);
    setTitle(r.title);
    setLink(r.url || '');
    setOpenUrlOnDue(r.openUrlOnDue === true);
    setZone(r.timeZone);
    setWhen(localInput(r.dueAt, r.timeZone));
    setRepeat(r.recurrence);
  }
  return (
    <>
      <form onSubmit={save} className="reminder-form">
        <label>
          What should Mochi remember?
          <input
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Take a screen break"
          />
        </label>
        <div className="two-col">
          <label>
            Date & time
            <input
              required
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <label>
            Repeat
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as Reminder['recurrence'])}
            >
              <option value="none">Just once</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
            </select>
          </label>
        </div>
        <label>
          Timezone
          <input
            required
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Asia/Dubai"
          />
        </label>
        <label>
          Linked page (optional)
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <label className="toggle-row">
          <span>
            Open this page automatically when due
            <small>
              Local reminders only. Snoozing keeps the link manual. Imported backups never enable
              automatic opening.
            </small>
          </span>
          <input
            type="checkbox"
            checked={openUrlOnDue}
            onChange={(e) => setOpenUrlOnDue(e.target.checked)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="button-row">
          <button className="primary" type="submit">
            {editing ? 'Save changes' : 'Add reminder'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setTitle('');
                setLink('');
                setOpenUrlOnDue(false);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
      {catchUp.length > 0 && (
        <aside className="notice">
          <strong>While you were away</strong>
          {catchUp.map((r) => (
            <div key={r.id}>
              {r.title}
              <button
                onClick={() => void send({ type: 'reminder-action', id: r.id, action: 'dismiss' })}
              >
                Dismiss
              </button>
              <button
                onClick={() =>
                  void send({ type: 'reminder-action', id: r.id, action: 'snooze', minutes: 10 })
                }
              >
                Snooze 10m
              </button>
            </div>
          ))}
        </aside>
      )}
      <div className="reminder-list">
        {reminders.length === 0 ? (
          <div className="empty">
            A little room for what matters.<small>Your reminders will appear here.</small>
          </div>
        ) : (
          [...reminders]
            .sort((a, b) => a.dueAt - b.dueAt)
            .map((r) => (
              <article className={`reminder-row ${r.completed ? 'completed' : ''}`} key={r.id}>
                <span className="reminder-dot" />
                <div className="grow">
                  <strong>{r.title}</strong>
                  <small>
                    {new Date(r.dueAt).toLocaleString(undefined, { timeZone: r.timeZone })} ·{' '}
                    {r.timeZone} · {r.recurrence}
                    {r.paused ? ' · paused' : ''}
                    {r.completed ? ' · done' : ''}
                    {r.openUrlOnDue ? ' · opens linked page when due' : ''}
                  </small>
                  <div className="row-actions">
                    <button
                      onClick={() =>
                        void send({
                          type: 'reminder-action',
                          id: r.id,
                          action: 'snooze',
                          minutes: 10,
                        })
                      }
                    >
                      Snooze 10m
                    </button>
                    <button
                      onClick={() =>
                        void send({ type: 'reminder-action', id: r.id, action: 'dismiss' })
                      }
                    >
                      Dismiss
                    </button>
                    {r.source !== 'calendar' && <button onClick={() => edit(r)}>Edit</button>}
                    {r.recurrence !== 'none' && (
                      <button
                        onClick={() =>
                          void send({ type: 'reminder-action', id: r.id, action: 'toggle' })
                        }
                      >
                        {r.paused ? 'Resume' : 'Pause'}
                      </button>
                    )}
                    <button
                      className="danger-text"
                      aria-label={`Delete reminder ${r.title}`}
                      onClick={() => void send({ type: 'reminder-delete', id: r.id })}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
        )}
      </div>
    </>
  );
}
