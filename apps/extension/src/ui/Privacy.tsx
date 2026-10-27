import type { AppData } from '@mochi/shared';
export function Privacy({
  data,
  exportData,
  importFile,
  reset,
}: {
  data: AppData;
  exportData: () => void;
  importFile: (file?: File) => void;
  reset: () => void;
}) {
  return (
    <>
      <section className="card">
        <h2>Locally yours</h2>
        <p>
          No server, analytics, advertising, external AI service, or mandatory account. Settings,
          reminders, positions, and your Mochi command history stay in{' '}
          <code>chrome.storage.local</code>.
        </p>
        <p>
          The overlay needs HTTP/HTTPS content-script access to appear across sites. Mochi does not
          collect browsing history. Media controls read the player title and audio/video status only
          when requested; saving a page reminder stores its title and link locally. Google API
          access is requested only when you connect. OAuth tokens stay in Chrome’s identity cache.
          Calendar caches keep generic event times and reminder labels; Gmail keeps counters and
          synchronization IDs, not subjects or message bodies. Google workflow queries and drafts
          are not saved to Mochi history.
        </p>
        <div className="button-row">
          <button className="primary" onClick={exportData}>
            Export backup
          </button>
          <label className="file-button">
            Import backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <button className="danger-text" onClick={reset}>
            Delete local Mochi data
          </button>
        </div>
        <p className="fine">
          Backups include reminder titles and command history. Keep them private. They contain no
          Google tokens or cached account data. Import replaces settings and schedules after
          confirmation.
        </p>
      </section>
      <section className="card">
        <h2>Clear controls, predictable behavior</h2>
        <dl className="lifecycle-explainer">
          <dt>Pause</dt>
          <dd>Rest the pet and stop optional sync. Enabled local reminders continue.</dd>
          <dt>Hide</dt>
          <dd>
            Hide the pet between alerts. Enabled reminders and connections continue, and due
            reminders bring the pet back with a readable dialogue.
          </dd>
          <dt>Shutdown</dt>
          <dd>
            Hide Mochi and stop all background services. Schedules and account consent are preserved
            until you resume.
          </dd>
          <dt>Disable / uninstall</dt>
          <dd>
            Use your browser’s Extensions page. Mochi cannot disable or uninstall itself. Removing
            the extension deletes its local data.
          </dd>
        </dl>
        <p className="fine">
          Alt+Shift+M toggles the pet; Alt+Shift+Q shuts it down. Change shortcuts in your browser
          if another app uses them. Browser internal pages and extension stores are restricted.
        </p>
      </section>
      <section className="card">
        <h2>Diagnostics</h2>
        <div className="diagnostic-stats">
          <span>
            <strong>{data.reminders.length}</strong>saved reminders
          </span>
          <span>
            <strong>{data.history.length}</strong>recent commands
          </span>
          <span>
            <strong>{data.settings.lifecycle}</strong>current mode
          </span>
        </div>
        <h3>Recent errors</h3>
        {data.diagnostics.length ? (
          data.diagnostics.map((d, i) => (
            <p className="fine" key={i}>
              {new Date(d.at).toLocaleString()} · {d.message}
            </p>
          ))
        ) : (
          <p className="fine">No recent errors recorded.</p>
        )}
        <p className="fine">
          Operational diagnostics only. OS settings can block notifications. Browser sleep and
          shutdown delay scheduled work.
        </p>
      </section>
    </>
  );
}
