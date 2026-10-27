import { useState } from 'react';
import { Pet } from './Pet';
import { MusicPlayer } from './MusicPlayer';
import { safeUrl, PET_SKINS, PET_SKIN_LABELS } from '@mochi/shared';
import type { AppData, Settings, FollowCursorFrequency } from '@mochi/shared';
export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
export function CompanionSettings({
  s,
  patch,
}: {
  s: Settings;
  patch: (p: Partial<Settings>) => Promise<boolean>;
}) {
  return (
    <>
      <section className="companion-hero">
        <div>
          <span className="eyebrow">MEET YOUR LITTLE SIDEKICK</span>
          <h2>
            Soft paws.
            <br />
            Good company.
          </h2>
          <p>A tiny reminder to make room for the little things.</p>
        </div>
        <Pet
          skin={s.skin}
          mood={s.lifecycle === 'paused' ? 'sleeping' : 'idle'}
          size={210}
          paused={s.lifecycle !== 'running'}
        />
      </section>
      <section className="card">
        <h2>Choose your companion</h2>
        <div className="skin-picker">
          {PET_SKINS.map((skin) => (
            <button
              key={skin}
              aria-pressed={s.skin === skin}
              className={s.skin === skin ? 'active' : ''}
              onClick={() => void patch({ skin })}
            >
              <Pet skin={skin} size={82} animated={false} />
              <span>{PET_SKIN_LABELS[skin]}</span>
            </button>
          ))}
        </div>
        <div className="two-col">
          <label>
            Pet size · {s.size}px
            <input
              type="range"
              min="48"
              max="180"
              value={s.size}
              onChange={(e) => void patch({ size: +e.target.value })}
            />
          </label>
          <label>
            Opacity · {Math.round(s.opacity * 100)}%
            <input
              type="range"
              min="25"
              max="100"
              value={Math.round(s.opacity * 100)}
              onChange={(e) => void patch({ opacity: +e.target.value / 100 })}
            />
          </label>
        </div>
      </section>
      <section className="card">
        <h2>A personality at your pace</h2>
        <Toggle
          label="A little wander"
          hint="Occasional short walks around the page."
          value={s.wandering}
          onChange={(v) => void patch({ wandering: v })}
        />
        <Toggle
          label="Follow my cursor"
          hint="Brief, intermittent curiosity."
          value={s.following}
          onChange={(v) => void patch({ following: v })}
        />
        <label className="follow-frequency">
          How often to follow
          <select
            aria-label="Cursor follow frequency"
            value={s.followCursorFrequency}
            onChange={(e) =>
              void patch({ followCursorFrequency: e.target.value as FollowCursorFrequency })
            }
          >
            <option value="off">Off</option>
            <option value="rarely">Rarely</option>
            <option value="sometimes">Sometimes (default)</option>
            <option value="often">Often</option>
          </select>
          <small>
            Cursor following must also be enabled. Sometimes keeps the original gentle cadence.
          </small>
        </label>
        <Toggle
          label="Speech bubbles"
          value={s.bubble}
          onChange={(v) => void patch({ bubble: v })}
        />
        <Toggle
          label="Compact menu"
          value={s.compact}
          onChange={(v) => void patch({ compact: v })}
        />
        <Toggle
          label="Interaction sounds"
          hint="An original chime when you pet or feed Mochi."
          value={s.sound}
          onChange={(v) => void patch({ sound: v })}
        />
        <p className="fine">
          Your system’s reduced-motion preference is always respected. Mochi rests in hidden tabs.
          Supported HTTP/HTTPS pages show the pet; browser pages and extension stores are
          restricted.
        </p>
      </section>
    </>
  );
}
export function ReminderPreferences({
  s,
  patch,
}: {
  s: Settings;
  patch: (p: Partial<Settings>) => Promise<boolean>;
}) {
  return (
    <section className="card">
      <h2>When life gets quiet</h2>
      <Toggle
        label="Reminder notifications"
        hint="Turning this off keeps schedules without delivering them."
        value={s.remindersEnabled}
        onChange={(v) => void patch({ remindersEnabled: v })}
      />
      <label>
        When a reminder was missed
        <select
          value={s.missedPolicy}
          onChange={(e) => void patch({ missedPolicy: e.target.value as Settings['missedPolicy'] })}
        >
          <option value="notify">Notify once when the browser returns</option>
          <option value="skip">Skip expired reminders</option>
          <option value="catch-up">Keep a catch-up list</option>
        </select>
      </label>
      <Toggle
        label="Quiet hours"
        hint="Suppress notifications and interaction sounds during this window."
        value={s.quietHours.enabled}
        onChange={(v) => void patch({ quietHours: { ...s.quietHours, enabled: v } })}
      />
      <div className="two-col">
        <label>
          From
          <input
            type="time"
            value={s.quietHours.start}
            onChange={(e) => void patch({ quietHours: { ...s.quietHours, start: e.target.value } })}
          />
        </label>
        <label>
          Until
          <input
            type="time"
            value={s.quietHours.end}
            onChange={(e) => void patch({ quietHours: { ...s.quietHours, end: e.target.value } })}
          />
        </label>
      </div>
      <p className="fine">
        Alarms may be delayed, especially after sleep. The browser must be running. Quiet-hour
        reminders wait until quiet hours end, then follow your missed-reminder policy.
      </p>
    </section>
  );
}
export function MusicSettings({
  data,
  patch,
  notice,
}: {
  data: AppData;
  patch: (p: Partial<Settings>) => Promise<boolean>;
  notice: (s: string) => void;
}) {
  const [name, setName] = useState(''),
    [url, setUrl] = useState('');
  const s = data.settings;
  return (
    <>
      <section className="card">
        <h2>A soundtrack for small moments</h2>
        <MusicPlayer
          lastUrl={
            data.history.find((h) =>
              ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(new URL(h.url).hostname),
            )?.url
          }
        />
        <p>
          “Play Mercy by Shawn Mendes” finds recordings on YouTube. Start one once, then use Your
          Playing Tab above for play/pause, volume, seeking and looping when the player supports
          them.
        </p>
        <small>
          Next and previous depend on supported site controls. Protected players can refuse
          requests; Mochi reports their response. The separate local demo remains available below
          those controls.
        </small>
      </section>
      <section className="card">
        <h2>Your familiar places</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const destination = safeUrl(url),
              key = name.trim().toLowerCase();
            if (!destination || !key) {
              notice('Use a name and a full HTTP or HTTPS address.');
              return;
            }
            void patch({ shortcuts: { ...s.shortcuts, [key]: destination } });
            setName('');
            setUrl('');
          }}
        >
          <div className="two-col">
            <label>
              Shortcut name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My notes"
              />
            </label>
            <label>
              Website address
              <input
                required
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
          </div>
          <button className="primary">Save shortcut</button>
        </form>
        <div className="shortcuts">
          {Object.entries(s.shortcuts).map(([key, destination]) => (
            <div key={key}>
              <strong>{key}</strong>
              <span>{destination}</span>
              <button
                aria-label={`Remove ${key} shortcut`}
                onClick={() => {
                  const next = { ...s.shortcuts };
                  delete next[key];
                  void patch({ shortcuts: next });
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Recently opened with Mochi</h2>
        {data.history.length ? (
          data.history.map((h) => (
            <div className="history-row" key={h.id}>
              <a href={h.url} target="_blank" rel="noreferrer">
                {h.command}
              </a>
              <small>{new Date(h.at).toLocaleString()}</small>
            </div>
          ))
        ) : (
          <p className="fine">No commands yet. This records only commands you give Mochi.</p>
        )}
      </section>
    </>
  );
}
