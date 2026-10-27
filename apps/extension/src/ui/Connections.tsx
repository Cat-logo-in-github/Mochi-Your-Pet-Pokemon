import type { GoogleService, GoogleStatus, Message } from '../protocol';
import { Toggle } from './Preferences';
export function Connections({
  google,
  send,
  notice,
}: {
  google: GoogleStatus | null;
  send: (m: Message) => Promise<boolean>;
  notice: (s: string) => void;
}) {
  async function connect(service: GoogleService) {
    const origins =
      service === 'calendar'
        ? ['https://www.googleapis.com/*']
        : ['https://gmail.googleapis.com/*'];
    try {
      const granted = await chrome.permissions.request({ origins });
      if (!granted) {
        notice('Website permission was declined. You can connect later.');
        return;
      }
      await send({ type: 'google', service, action: 'connect' });
    } catch {
      notice('The browser could not start consent. Check Google setup and try again.');
    }
  }
  return (
    <>
      <section className="card">
        <span className="tag">Entirely optional</span>
        <h2>A little more connected</h2>
        <p>
          Mochi works without Google. Connect only the services you choose, with separate read-only
          consent.
        </p>
        <ol>
          <li>In a personal monitoring build, choose Calendar or Gmail and press Connect.</li>
          <li>Approve that read-only service in Google’s consent screen.</li>
          <li>
            Return here to check Connected and the last sync time, then test system notifications.
          </li>
        </ol>
        <p className="fine">
          Searches and drafts open on Google after a review click. No write permissions are
          requested, and no mail is sent or event saved automatically.
        </p>
        {!google?.configured && (
          <div className="notice">
            <strong>Google web shortcuts work without an API project</strong>
            <p>
              This public build uses no shared Google project or quota. Search Gmail, review a draft
              or open Calendar through the command box. Optional automatic monitoring requires your
              own Google project and a personal extension copy.
            </p>
            <details>
              <summary>Personal Google monitoring setup</summary>
              <p>
                Create your own Google project and Chrome-extension OAuth client for extension ID
                imachbdfmaljglbplhifpbogjckhnbkl. Use the included setup-personal-google.ps1 helper,
                or the developer build below. Supply that public client ID only to an explicit local{' '}
                <code>--personal-google</code> build through <code>MOCHI_GOOGLE_CLIENT_ID</code>. No
                client secret is needed or accepted, and nothing is sent through publisher
                infrastructure. The browser cannot change the identity API client ID at runtime.
              </p>
            </details>
          </div>
        )}
        {google?.configured && (
          <p className="notice">
            Personal API build: Calendar and Gmail monitoring use the Google project chosen for this
            private build. Connect only the read-only services you want.
          </p>
        )}
        {google && !google.platformSupported && (
          <p className="notice">
            This OAuth adapter supports Chrome identity. Google connections in Edge are unavailable
            in this build; local features still work.
          </p>
        )}
        {(['calendar', 'gmail'] as GoogleService[]).map((service) => {
          const status = google?.[service];
          return (
            <section className="connection" key={service}>
              <div className="section-top">
                <h3>{service === 'calendar' ? 'Google Calendar' : 'Gmail'}</h3>
                <span className="status-pill">
                  {status?.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <p>
                {service === 'calendar'
                  ? 'Read event times and schedule advance reminders. Mochi keeps generic event labels; open Calendar for private details.'
                  : 'Show an unread count and generic new-mail alerts. Message bodies and subjects are not requested. Mochi never sends, deletes or marks mail.'}
              </p>
              {status?.connected && (
                <p className="fine">
                  {service === 'calendar'
                    ? `${google?.calendar.items.length || 0} upcoming event times cached`
                    : `${google?.gmail.unread || 0} unread inbox messages`}
                </p>
              )}
              <small>
                Last successful sync:{' '}
                {status?.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}
              </small>
              <small>
                Last check attempt:{' '}
                {status?.lastAttemptAt
                  ? new Date(status.lastAttemptAt).toLocaleString()
                  : 'Not checked yet'}
              </small>
              <small>
                {google?.monitoringState === 'paused'
                  ? 'Automatic monitoring is paused.'
                  : google?.monitoringState === 'disabled'
                    ? 'Automatic monitoring is shut down.'
                    : status?.connected
                      ? `Expected next check: ${status.nextCheckAt ? new Date(status.nextCheckAt).toLocaleString() : 'about one minute'}. Browser sleep can delay it.`
                      : 'Connect a personal Google build to monitor automatically.'}
              </small>
              {service === 'gmail' && (
                <p className="fine">
                  New-mail filter:{' '}
                  {google?.config.gmailMode === 'all'
                    ? 'All new inbox mail'
                    : google?.config.gmailMode === 'senders'
                      ? 'Only exact important-sender matches'
                      : 'Important label or exact important-sender matches'}
                  . Ordinary test mail is excluded by Important mode. Existing mail is not
                  re-alerted at initial connection.
                </p>
              )}
              {service === 'gmail' && google?.gmail.check && (
                <div className="notice" aria-label="Last Gmail check result">
                  <strong>
                    {
                      {
                        baseline:
                          'Initial baseline is ready. Send a fresh test email now, then Check now.',
                        queued: 'Eligible mail was saved in Mochi’s inbox.',
                        'quiet-hours':
                          'Eligible mail is queued; system alerts wait until quiet hours end.',
                        muted: 'Eligible mail is queued in Mochi; Gmail system alerts are muted.',
                        filtered:
                          'The selected mail filter excluded these arrivals. Choose All new inbox mail to include ordinary test mail.',
                        'no-new-mail': 'No new eligible inbox arrivals in the last check.',
                        processing: 'A large batch is continuing on the next check.',
                        'os-blocked':
                          'Mail is saved in Mochi’s inbox, but the browser refused its system alert. Check notification permissions.',
                        'waiting-inbox':
                          'Some messages have not reached Inbox yet. Mochi also checks later Inbox label changes.',
                      }[google.gmail.check.reason]
                    }
                  </strong>
                  {google.gmail.check.historyRecovered && (
                    <p>
                      Gmail history had expired. This check recovered recent inbox arrivals using a
                      bounded scan; open Gmail to review any older, moved or deleted mail.
                    </p>
                  )}
                  <p>
                    Examined {google.gmail.check.examined} · eligible {google.gmail.check.eligible}{' '}
                    · saved {google.gmail.check.queued} · filtered {google.gmail.check.filtered} ·
                    waiting for Inbox {google.gmail.check.waitingForInbox} · already handled{' '}
                    {google.gmail.check.duplicates} · remaining {google.gmail.check.pending}
                  </p>
                </div>
              )}
              {service === 'calendar' && (
                <div className="notice" aria-label="Calendar reminder coverage">
                  <strong>
                    {google?.calendar.scheduledCount || 0} active Calendar reminder notifications
                    saved
                  </strong>
                  <p>
                    Selected calendars: {google?.config.calendarIds.length || 0}. Event types:{' '}
                    {google?.config.eventTypes.length
                      ? google.config.eventTypes.join(', ')
                      : 'all types returned by Google'}
                    . Rolling horizon: 30 days
                    {google?.calendar.horizonEnd
                      ? `, through ${new Date(google.calendar.horizonEnd).toLocaleDateString()}`
                      : ''}
                    .{' '}
                    {google?.calendar.nextReminderAt
                      ? `Next reminder: ${new Date(google.calendar.nextReminderAt).toLocaleString()}.`
                      : 'No active saved Calendar reminder yet.'}
                  </p>
                  <small>
                    Timed events use Mochi’s advance setting. All-day events use the selected local
                    hour when enabled. This does not copy Google’s individual reminder overrides or
                    schedule your entire lifetime calendar.
                  </small>
                </div>
              )}
              {status?.error && (
                <p className="error">
                  {status.error}
                  {service === 'calendar'
                    ? ' Previously saved schedules remain until a complete sync succeeds.'
                    : ''}
                </p>
              )}
              <div className="button-row">
                {status?.connected ? (
                  <>
                    <button
                      onClick={() => void send({ type: 'google', service, action: 'refresh' })}
                    >
                      Check now
                    </button>
                    <button
                      onClick={() => void send({ type: 'google', service, action: 'disconnect' })}
                    >
                      Disconnect & clear cached data
                    </button>
                  </>
                ) : (
                  <button
                    className="primary"
                    disabled={!google?.configured || !google?.platformSupported}
                    onClick={() => void connect(service)}
                  >
                    Connect {service === 'calendar' ? 'Calendar' : 'Gmail'}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </section>
      <p className="fine">
        For multiple Google accounts, verify the Chrome profile and the account chosen during
        consent. A Google web tab can use a different default account; Mochi does not display or
        save your account address.
      </p>
      {google && (
        <section className="card">
          <h2>Connection preferences</h2>
          <p>
            Automatic checks run about every minute while the browser is running. Check now runs an
            immediate check; system notification permission is separate.
          </p>
          <button onClick={() => void send({ type: 'notification-test' })}>
            Test system notification + Mochi inbox
          </button>
          {google.config.gmailModeNeedsReview && (
            <div className="notice">
              <strong>Review your saved mail filter</strong>
              <p>
                An older copy saved Important or Senders mode. It is preserved, so ordinary test
                mail may be filtered.
              </p>
              <div className="button-row">
                <button
                  onClick={() =>
                    void send({
                      type: 'google-config',
                      patch: { gmailMode: 'all', notificationPreferencesVersion: 1 },
                    })
                  }
                >
                  Enable all new inbox mail
                </button>
                <button
                  onClick={() =>
                    void send({
                      type: 'google-config',
                      patch: { notificationPreferencesVersion: 1 },
                    })
                  }
                >
                  Keep my selected filter
                </button>
              </div>
            </div>
          )}
          <label>
            Gmail notification mode
            <select
              aria-label="Gmail notification mode"
              value={google.config.gmailMode}
              onChange={(e) =>
                void send({
                  type: 'google-config',
                  patch: {
                    gmailMode: e.target.value as 'important' | 'senders' | 'all',
                    notificationPreferencesVersion: 1,
                  },
                })
              }
            >
              <option value="important">Important label or my important senders</option>
              <option value="senders">Only my important senders</option>
              <option value="all">All new inbox mail (default)</option>
            </select>
          </label>
          <p className="fine">
            After changing a filter, send a fresh test message or open Gmail to review earlier
            filtered mail. Mochi does not replay previously handled messages.
          </p>
          <label>
            Important sender addresses
            <input
              aria-label="Important sender addresses"
              defaultValue={google.config.gmailSenders.join(', ')}
              placeholder="Add exact sender addresses, separated by commas"
              onBlur={(e) =>
                void send({
                  type: 'google-config',
                  patch: {
                    gmailSenders: e.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
            <small>
              This list stays in this browser profile, outside backups and the project. Matching may
              read the sender header transiently; alerts remain generic.
            </small>
          </label>
          <label>
            Remind me before an event
            <select
              value={google.config.offsetMinutes}
              onChange={(e) =>
                void send({ type: 'google-config', patch: { offsetMinutes: +e.target.value } })
              }
            >
              {[0, 5, 10, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
          {google.config.gmailMode === 'senders' && !google.config.gmailSenders.length && (
            <p className="notice">
              Add important sender addresses to receive alerts in senders-only mode.
            </p>
          )}
          <Toggle
            label="All-day event reminders"
            hint="Schedule a reminder at the chosen hour in each calendar’s timezone."
            value={google.config.allDayReminders}
            onChange={(value) =>
              void send({ type: 'google-config', patch: { allDayReminders: value } })
            }
          />
          <label>
            All-day reminder hour
            <select
              aria-label="All-day reminder hour"
              value={google.config.allDayHour}
              onChange={(event) =>
                void send({ type: 'google-config', patch: { allDayHour: +event.target.value } })
              }
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>Advanced service preferences</summary>
            <label>
              Calendar IDs, separated by commas
              <input
                defaultValue={google.config.calendarIds.join(', ')}
                onBlur={(e) =>
                  void send({
                    type: 'google-config',
                    patch: {
                      calendarIds: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>

            <label>
              Event types, separated by commas
              <input
                defaultValue={google.config.eventTypes.join(', ')}
                placeholder="default, focusTime"
                onBlur={(e) =>
                  void send({
                    type: 'google-config',
                    patch: {
                      eventTypes: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
          </details>
          <Toggle
            label="Mute Gmail system alerts"
            hint="Eligible mail still stays in Mochi’s inbox for you to read. Unmute to release queued system alerts."
            value={google.config.gmailMuted}
            onChange={(v) => void send({ type: 'google-config', patch: { gmailMuted: v } })}
          />
          {google.calendar.items.length > 0 && (
            <>
              <h3>Upcoming event times</h3>
              <p className="fine">
                Names and descriptions stay in Google Calendar. Timed event reminders are generic,
                and Calendar tasks are a separate Google service.
              </p>
              {google.calendar.items.map((item) => (
                <div className="history-row" key={item.id}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open Calendar event details
                  </a>
                  <small>
                    {new Date(item.start).toLocaleString()}
                    {item.allDay ? ' · all-day' : ''} ·{' '}
                    {item.scheduled
                      ? `Reminder saved${item.reminderAt ? ': ' + new Date(item.reminderAt).toLocaleString() : ''}`
                      : 'No reminder scheduled for this item'}
                  </small>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
