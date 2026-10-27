import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pet } from './ui/Pet';
import { CommandBox } from './ui/CommandBox';
import { PendingReminderInbox } from './ui/PendingReminderInbox';
import { NotificationStatus } from './ui/NotificationStatus';
import { MusicPlayer } from './ui/MusicPlayer';
import { useMochi } from './ui/useMochi';
import './ui/styles.css';
export function Popup() {
  const { data, google, error, notice, send, patch, pendingReminders, notificationPermission } =
    useMochi();
  const [happy, setHappy] = useState(false);
  if (!data)
    return (
      <main className="popup">
        <h1>Mochi</h1>
        <p role="status">{error || 'Waking up your little companion…'}</p>
        <button onClick={() => void send({ type: 'get' })}>Try again</button>
      </main>
    );
  const s = data.settings;
  const next = data.reminders
    .filter((r) => !r.completed && !r.paused)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  const youtube = data.history.find((h) =>
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(new URL(h.url).hostname),
  );
  return (
    <main className="popup">
      <header className="popup-header">
        <a className="wordmark" href="#" onClick={(e) => e.preventDefault()}>
          mochi<span>✦</span>
        </a>
        <button
          className="icon-button"
          aria-label="Open settings"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          ⚙
        </button>
      </header>
      <div className="pet-greeting">
        <div>
          <span className="eyebrow">A SMALL FRIEND FOR YOUR DAY</span>
          <h1>
            A little company.
            <br />A lighter day.
          </h1>
          <span className={`status-pill state-${s.lifecycle}`}>
            <i />
            {s.lifecycle === 'running' ? 'Mochi is feeling cozy' : `Mochi is ${s.lifecycle}`}
          </span>
        </div>
        <button
          className="pet-preview"
          aria-label="Pet Mochi"
          onClick={() => {
            setHappy(true);
            setTimeout(() => setHappy(false), 1500);
          }}
        >
          <Pet
            skin={s.skin}
            mood={happy ? 'happy' : s.lifecycle === 'paused' ? 'sleeping' : 'idle'}
            size={123}
            paused={s.lifecycle !== 'running'}
          />
        </button>
      </div>
      <CommandBox
        shortcuts={s.shortcuts}
        run={(text) => send({ type: 'command', text })}
        confirmGoogle={(text) => send({ type: 'google-workflow-open', text })}
      />
      {(notice || error) && (
        <p className={error ? 'error' : 'notice'} role="status">
          {error || notice}
        </p>
      )}
      <button
        className="page-reminder-shortcut"
        onClick={() =>
          void send({ type: 'command', text: 'remind me about this page in 30 minutes' })
        }
      >
        Remember this page · 30 minutes
      </button>
      <PendingReminderInbox notices={pendingReminders} send={send} />
      <section className="up-next">
        <div className="section-top">
          <span className="eyebrow">UP NEXT</span>
          <button className="text-link" onClick={() => void chrome.runtime.openOptionsPage()}>
            Manage ↗
          </button>
        </div>
        {next ? (
          <>
            <strong>{next.title}</strong>
            <small>{new Date(next.dueAt).toLocaleString()}</small>
            <button
              className="text-link"
              onClick={() =>
                void send({ type: 'reminder-action', id: next.id, action: 'snooze', minutes: 10 })
              }
            >
              Snooze 10 minutes
            </button>
          </>
        ) : (
          <p>
            No reminders yet.<small>Try “remind me in 10 minutes to stretch”.</small>
          </p>
        )}
      </section>
      <button className="primary summon-button" onClick={() => void send({ type: 'summon' })}>
        Call Mochi to this page
      </button>
      <p className="fine">The pet roams on ordinary web pages. This popup is its remote control.</p>
      <MusicPlayer lastUrl={youtube?.url} />
      <NotificationStatus permission={notificationPermission} />
      <div className="lifecycle-controls">
        <button
          onClick={() => void patch({ lifecycle: s.lifecycle === 'paused' ? 'running' : 'paused' })}
        >
          {s.lifecycle === 'paused' ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => void patch({ lifecycle: s.lifecycle === 'hidden' ? 'running' : 'hidden' })}
        >
          {s.lifecycle === 'hidden' ? 'Show pet' : 'Hide pet'}
        </button>
        <button
          className="danger-text"
          onClick={() =>
            void patch({ lifecycle: s.lifecycle === 'disabled' ? 'running' : 'disabled' })
          }
        >
          {s.lifecycle === 'disabled' ? 'Wake Mochi' : 'Shut down'}
        </button>
      </div>
      <footer className="popup-footer">
        Local first. No account needed.
        <span>
          {google?.gmail.connected
            ? 'Gmail: ' + google.gmail.unread + ' unread'
            : 'Google: disconnected'}
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Popup />);
