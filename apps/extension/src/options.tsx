import { PendingReminderInbox } from './ui/PendingReminderInbox';
import { NotificationStatus } from './ui/NotificationStatus';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateImport } from '@mochi/shared';
import { Pet } from './ui/Pet';
import { CommandBox } from './ui/CommandBox';
import { ReminderManager } from './ui/ReminderManager';
import { CompanionSettings, ReminderPreferences, MusicSettings } from './ui/Preferences';
import { Connections } from './ui/Connections';
import { Privacy } from './ui/Privacy';
import { useMochi } from './ui/useMochi';
import './ui/styles.css';
const tabs = [
  'Your companion',
  'Reminders',
  'Music & shortcuts',
  'Connections',
  'Privacy & diagnostics',
];
export function Options() {
  const version =
    typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function'
      ? chrome.runtime.getManifest().version || '1.3.0'
      : '1.3.0';
  const {
    data,
    google,
    error,
    notice,
    setNotice,
    send,
    patch,
    notificationPermission,
    pendingReminders,
  } = useMochi();
  const [tab, setTab] = useState(0),
    [destructive, setDestructive] = useState<'reset' | 'import' | null>(null),
    [pendingImport, setPendingImport] = useState<unknown>(null);
  if (!data)
    return (
      <main className="loading">
        <h1>mochi ✦</h1>
        <p role="status">{error || 'A moment. Mochi is getting comfortable.'}</p>
        <button onClick={() => void send({ type: 'get' })}>Try again</button>
      </main>
    );
  const s = data.settings;
  function exportData() {
    if (!data) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: 'mochi-backup',
            version: 1,
            data: {
              ...data,
              reminders: data.reminders.filter((r) => r.source !== 'calendar'),
              catchUp: data.catchUp.filter((r) => r.source !== 'calendar'),
            },
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mochi-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice('Backups must be smaller than 2 MB.');
      return;
    }
    try {
      const parsed = validateImport(JSON.parse(await file.text()));
      setPendingImport(parsed);
      setDestructive('import');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That backup is invalid.');
    }
  }
  return (
    <div className="settings-shell">
      <aside className="sidebar">
        <a className="wordmark" href="#" onClick={(e) => e.preventDefault()}>
          mochi<span>✦</span>
        </a>
        <p>
          A small friend.
          <br />
          Your kind of day.
        </p>
        <nav aria-label="Settings sections">
          {tabs.map((name, i) => (
            <button
              key={name}
              aria-current={tab === i ? 'page' : undefined}
              onClick={() => setTab(i)}
            >
              <span aria-hidden="true">{['✦', '◷', '♫', '⤴', '◇'][i]}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Pet
            skin={s.skin}
            size={100}
            mood={s.lifecycle === 'running' ? 'idle' : 'sleeping'}
            animated={false}
          />
          <span className="status-pill">
            <i />
            {s.lifecycle}
          </span>
          <button
            onClick={() =>
              void patch({ lifecycle: s.lifecycle === 'disabled' ? 'running' : 'disabled' })
            }
          >
            {s.lifecycle === 'disabled' ? 'Wake Mochi' : 'Quick shutdown'}
          </button>
          <small>v{version} · locally yours</small>
        </div>
      </aside>
      <main className="settings-main">
        <header className="settings-header">
          <div>
            <span className="eyebrow">MAKE YOURSELF AT HOME</span>
            <h1>{tabs[tab]}</h1>
          </div>
          <div className="button-row">
            <button
              onClick={() =>
                void patch({ lifecycle: s.lifecycle === 'paused' ? 'running' : 'paused' })
              }
            >
              {s.lifecycle === 'paused' ? 'Resume pet' : 'Pause pet'}
            </button>
            <button
              onClick={() =>
                void patch({ lifecycle: s.lifecycle === 'hidden' ? 'running' : 'hidden' })
              }
            >
              {s.lifecycle === 'hidden' ? 'Show pet' : 'Hide pet'}
            </button>
          </div>
        </header>
        {(notice || error) && (
          <div role="status" className={error ? 'error' : 'notice'}>
            {error || notice}
            <button aria-label="Dismiss message" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {tab === 0 && (
          <>
            <CompanionSettings s={s} patch={patch} />
            <CommandBox
              shortcuts={s.shortcuts}
              run={(text) => send({ type: 'command', text })}
              confirmGoogle={(text) => send({ type: 'google-workflow-open', text })}
            />
          </>
        )}
        {tab === 1 && (
          <>
            <section className="card">
              <h2>A gentle nudge, right on time</h2>
              <p>Schedules stay on this device. Browser alarms wake Mochi when they’re due.</p>
              <ReminderManager reminders={data.reminders} catchUp={data.catchUp} send={send} />
            </section>
            <NotificationStatus permission={notificationPermission} />
            <PendingReminderInbox notices={pendingReminders} send={send} />
            <ReminderPreferences s={s} patch={patch} />
          </>
        )}
        {tab === 2 && <MusicSettings data={data} patch={patch} notice={setNotice} />}
        {tab === 3 && <Connections google={google} send={send} notice={setNotice} />}
        {tab === 4 && (
          <Privacy
            data={data}
            exportData={exportData}
            importFile={(file) => void importFile(file)}
            reset={() => setDestructive('reset')}
          />
        )}
        <footer className="settings-footer">
          Made for quieter corners of the internet. <span>Mochi · {version}</span>
        </footer>
      </main>
      {destructive && (
        <div className="modal-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="confirm-dialog"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDestructive(null);
            }}
          >
            <h2 id="confirm-title">
              {destructive === 'reset'
                ? 'Delete Mochi’s local data?'
                : 'Replace your current backup?'}
            </h2>
            <p>
              {destructive === 'reset'
                ? 'This deletes settings, reminders, history, and cached connection data. Export a backup first to keep them. Revoke remaining Google account consent from your Google account.'
                : 'Your settings, schedules, and history will be replaced with the validated backup. Google connections are not imported.'}
            </p>
            <div className="button-row">
              <button
                autoFocus
                onClick={() => {
                  setDestructive(null);
                  setPendingImport(null);
                }}
              >
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => {
                  void send(
                    destructive === 'reset'
                      ? { type: 'reset' }
                      : { type: 'import', data: pendingImport },
                  );
                  setDestructive(null);
                  setPendingImport(null);
                }}
              >
                Confirm {destructive === 'reset' ? 'deletion' : 'import'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Options />);
