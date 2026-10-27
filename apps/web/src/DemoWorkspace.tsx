import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent } from 'react';
import {
  cursorFollowCooldown,
  DEFAULT_SETTINGS,
  parseCommand,
  PET_SKIN_LABELS,
  safeUrl,
} from '@mochi/shared';
import type { FollowCursorFrequency, Skin } from '@mochi/shared';
import { Pet } from '../../extension/src/ui/Pet';
import type { Mood } from '../../extension/src/ui/Pet';

type FollowFrequency = FollowCursorFrequency;
type DemoReminder = {
  id: string;
  title: string;
  dueAt: number;
  url?: string;
  openUrlOnDue?: boolean;
  linkStatus?: 'opened' | 'blocked';
};
const ASSET_BASE = `${import.meta.env.BASE_URL}mochi/`;
const TRACKS = [
  {
    title: 'Cloud garden',
    url: new URL('../../extension/public/audio/cloud-garden.wav', import.meta.url).href,
  },
  {
    title: 'Little afternoon',
    url: new URL('../../extension/public/audio/little-afternoon.wav', import.meta.url).href,
  },
];
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;

export function DemoWorkspace({ skin }: { skin: Skin }) {
  const [mood, setMood] = useState<Mood>('idle');
  const [reply, setReply] = useState('Hello, friend. A small break looks good on you.');
  const [command, setCommand] = useState('Remind me in 1 minute to stretch');
  const [link, setLink] = useState<{ url: string; label: string } | null>(null);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [following, setFollowing] = useState(false);
  const [frequency, setFrequency] = useState<FollowFrequency>(
    DEFAULT_SETTINGS.followCursorFrequency,
  );
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [reminders, setReminders] = useState<DemoReminder[]>([]);
  const [alerts, setAlerts] = useState<DemoReminder[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<string>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [loop, setLoop] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const lastFollow = useRef(0);
  const movementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osNotifications = useRef(new Set<Notification>());

  const deliver = useCallback((due: DemoReminder[]) => {
    const delivered = due.map((item) => {
      if (!item.url || !item.openUrlOnDue) return item;
      let linkStatus: 'opened' | 'blocked' = 'blocked';
      try {
        const destination = safeUrl(item.url);
        if (destination) {
          const opened = window.open('about:blank', '_blank');
          if (opened) {
            opened.opener = null;
            opened.location.replace(destination);
            linkStatus = 'opened';
          }
        }
      } catch {
        /* A blocked timed popup never prevents the reminder itself. */
      }
      return { ...item, openUrlOnDue: false, linkStatus };
    });
    setAlerts((previous) => [...previous, ...delivered].slice(0, 20));
    setVisible(true);
    setPosition({ x: 0, y: 0 });
    setMood('notification');
    setReply('I came back with a little reminder for you.');
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const item of due) {
        try {
          const notice = new Notification('Mochi reminder', {
            body: item.title,
            icon: `${import.meta.env.BASE_URL}favicon.png`,
            tag: `mochi-demo-${item.id}`,
          });
          osNotifications.current.add(notice);
          notice.onclose = () => osNotifications.current.delete(notice);
          notice.onclick = () => {
            window.focus();
            notice.close();
          };
        } catch {
          setNotificationStatus('unavailable');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!reminders.length || disabled) return;
    const next = Math.min(...reminders.map((item) => item.dueAt));
    const timer = setTimeout(
      () => {
        const due = reminders.filter((item) => item.dueAt <= Date.now());
        if (!due.length) return;
        const dueIds = new Set(due.map((item) => item.id));
        setReminders((previous) => previous.filter((item) => !dueIds.has(item.id)));
        deliver(due);
      },
      Math.min(2_147_000_000, Math.max(0, next - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [reminders, disabled, deliver]);

  useEffect(() => {
    const player = audio.current;
    return () => {
      player?.pause();
      if (movementTimer.current) clearTimeout(movementTimer.current);
      for (const notice of osNotifications.current) notice.close();
      osNotifications.current.clear();
    };
  }, []);

  function recall(scroll = false) {
    setVisible(true);
    setPaused(false);
    setDisabled(false);
    setPosition({ x: 0, y: 0 });
    setMood('happy');
    setReply('Here I am. Right by your side.');
    if (scroll) stage.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function schedule(title: string, dueAt: number, url?: string, openUrlOnDue = false) {
    if (reminders.length >= 20) {
      setReply('This little demo can keep 20 reminders. Remove one first.');
      return;
    }
    const destination = url ? safeUrl(url) : undefined;
    setReminders((previous) => [
      ...previous,
      {
        id: `demo-${++sequence.current}`,
        title,
        dueAt,
        ...(destination ? { url: destination, openUrlOnDue } : {}),
      },
    ]);
    setReply(`I’ll remind you: ${title}. Keep this tab open.`);
  }
  async function enableNotifications() {
    if (!('Notification' in window)) {
      setNotificationStatus('unsupported');
      return;
    }
    try {
      setNotificationStatus(await Notification.requestPermission());
    } catch {
      setNotificationStatus('unavailable');
    }
  }
  function testNotification() {
    deliver([
      {
        id: `test-${++sequence.current}`,
        title: 'A little reminder, right beside your companion.',
        dueAt: Date.now(),
      },
    ]);
  }
  function snooze() {
    const item = alerts[0];
    if (!item) return;
    if (reminders.length >= 20) {
      setReply('Remove a pending demo reminder before snoozing.');
      return;
    }
    setAlerts((previous) => previous.slice(1));
    schedule(item.title, Date.now() + 5 * 60_000, item.url);
  }
  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (
      !following ||
      frequency === 'off' ||
      !visible ||
      paused ||
      disabled ||
      alerts.length ||
      Date.now() - lastFollow.current < cursorFollowCooldown(frequency)
    )
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    lastFollow.current = Date.now();
    setPosition({
      x: Math.max(
        -Math.max(0, (bounds.width - 220) / 2),
        Math.min(
          Math.max(0, (bounds.width - 220) / 2),
          event.clientX - bounds.left - bounds.width / 2,
        ),
      ),
      y: Math.max(-30, Math.min(30, event.clientY - bounds.top - bounds.height / 2)),
    });
    setMood('walking');
    if (movementTimer.current) clearTimeout(movementTimer.current);
    movementTimer.current = setTimeout(() => setMood('idle'), 1_800);
  }
  function playTrack(index = track) {
    const player = audio.current;
    if (!player) return;
    setTrack(index);
    if (!player.src.endsWith(TRACKS[index].url)) {
      player.src = TRACKS[index].url;
      player.load();
    }
    player.volume = volume / 100;
    player.loop = loop;
    void player
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        setPlaying(false);
        setReply('Use Play demo to start audio. Your browser may need a direct click.');
      });
  }
  function pauseMusic() {
    audio.current?.pause();
    setPlaying(false);
  }
  function stopMusic() {
    pauseMusic();
    if (audio.current) audio.current.currentTime = 0;
    setCurrentTime(0);
  }
  function changeVolume(value: number) {
    setVolume(value);
    if (audio.current) audio.current.volume = value / 100;
  }
  function changeLoop(value: boolean) {
    setLoop(value);
    if (audio.current) audio.current.loop = value;
  }
  function seek(value: number) {
    if (!audio.current || !duration) return;
    const next = Math.max(0, Math.min(duration, value));
    audio.current.currentTime = next;
    setCurrentTime(next);
  }
  function runCommand(event: FormEvent) {
    event.preventDefault();
    const intent = parseCommand(command);
    setLink(null);
    if (intent.kind === 'summon') recall(true);
    else if (intent.kind === 'navigate') {
      setLink({ url: intent.url, label: intent.label });
      setReply(
        `Ready to open ${intent.label}. The player below controls only our local demo tracks.`,
      );
    } else if (intent.kind === 'reminder')
      schedule(intent.title, intent.dueAt, intent.url, intent.openUrlOnDue);
    else if (intent.kind === 'page-reminder')
      schedule(
        intent.title || document.title,
        intent.dueAt,
        safeUrl(window.location.href) || undefined,
        false,
      );
    else if (intent.kind === 'lifecycle') {
      const running = intent.value === 'running';
      setVisible(running || intent.value === 'paused');
      setPaused(intent.value === 'paused');
      setDisabled(intent.value === 'disabled');
      setReply(`Demo pet: ${intent.value}. Recall brings me back.`);
    } else if (intent.kind === 'preference') {
      if (intent.key === 'following') {
        setFollowing(intent.value);
        lastFollow.current = 0;
        setReply(`Cursor following ${intent.value ? 'enabled' : 'disabled'} inside this demo.`);
      } else setReply('Use the installed companion for roaming outside this little preview.');
    } else if (intent.kind === 'music') {
      switch (intent.action) {
        case 'pause':
          pauseMusic();
          break;
        case 'resume':
          playTrack();
          break;
        case 'next':
          playTrack((track + 1) % TRACKS.length);
          break;
        case 'previous':
          playTrack((track - 1 + TRACKS.length) % TRACKS.length);
          break;
        case 'volume':
          if (typeof intent.value === 'number') changeVolume(intent.value);
          break;
        case 'loop':
          changeLoop(Boolean(intent.value));
          break;
        case 'seek':
          if (typeof intent.value === 'number') seek(intent.value);
          break;
      }
      setReply(
        'That controls our local demo player. External websites keep their own media controls.',
      );
    } else if (intent.kind === 'calendar' || intent.kind === 'email') {
      setReply(
        'Connect Google in extension settings, enable notifications, and send a test. This website never connects to your account.',
      );
    } else if (intent.kind === 'clarify' || intent.kind === 'help') setReply(intent.message);
  }

  return (
    <div className="play-panel demo-workspace">
      <div className="play-stage" ref={stage} onPointerMove={followPointer}>
        <span className="stage-label">
          <span /> YOUR LITTLE CORNER
        </span>
        <div
          className="demo-pet-position"
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        >
          {visible && !disabled ? (
            <button
              className="demo-pet-button"
              aria-label={`Pet ${PET_SKIN_LABELS[skin]}`}
              onClick={() => {
                setMood('happy');
                setReply('A little hello goes a long way.');
              }}
            >
              <Pet
                skin={skin}
                mood={mood}
                size={210}
                paused={paused}
                assetBase={ASSET_BASE}
                onComplete={() =>
                  setMood((previous) => (previous === 'sleeping' ? previous : 'idle'))
                }
              />
            </button>
          ) : (
            <div className="demo-away">
              Taking a little break.
              <br />
              Call me back whenever you like.
            </div>
          )}
        </div>
        <div className="pixel-dialog demo-dialog" role="status">
          <span className="pixel-dialog-name">{PET_SKIN_LABELS[skin]}</span>
          <p>{reply}</p>
        </div>
        <div className="pet-actions">
          <button
            onClick={() => {
              setMood('feed');
              setReply('A little snack break. Thank you, friend.');
            }}
          >
            ◡ Feed
          </button>
          <button onClick={() => setMood(mood === 'sleeping' ? 'idle' : 'sleeping')}>
            {mood === 'sleeping' ? '☀ Wake' : '☾ Rest'}
          </button>
          <button
            onClick={() => {
              setVisible(false);
              setReply('Just out of sight. Reminders will bring me back.');
            }}
          >
            Hide
          </button>
          <button onClick={() => recall()}>↗ Call Mochi</button>
        </div>
      </div>
      <form className="command-form" onSubmit={runCommand}>
        <label htmlFor="demo-command">Ask Mochi something</label>
        <div className="command-input">
          <span aria-hidden="true">✧</span>
          <input
            id="demo-command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            maxLength={500}
            autoComplete="off"
          />
          <button type="submit" aria-label="Run demo command">
            ↗
          </button>
        </div>
        <div className="command-samples">
          <span>Try:</span>
          {[
            'come here',
            'pause music',
            'remind me in 20 min to check https://example.com',
            'Open GitHub',
          ].map((sample) => (
            <button type="button" key={sample} onClick={() => setCommand(sample)}>
              {sample}
            </button>
          ))}
        </div>
        {link && (
          <a className="command-result" href={link.url} target="_blank" rel="noopener noreferrer">
            Open {link.label} in a new tab ↗
          </a>
        )}
      </form>
      <div className="demo-settings">
        <div className="demo-section-heading">
          <span>01 / A GENTLE NUDGE</span>
          <h3>A reminder that finds you.</h3>
          <p>
            Try a reminder in five seconds. Mochi returns with a readable bubble until you dismiss
            or snooze it.
          </p>
        </div>
        <div className="demo-setting-actions">
          <button onClick={() => schedule('Take a little stretch break.', Date.now() + 5_000)}>
            Remind me in 5 seconds
          </button>
          <button onClick={testNotification}>Test notification</button>
        </div>
        <div className="demo-notification-status" role="status">
          <span>
            {notificationStatus === 'granted'
              ? '✓ Device notifications enabled for this website.'
              : notificationStatus === 'denied'
                ? 'Notifications are blocked. Allow this website in browser settings; the pet bubble still works.'
                : notificationStatus === 'unsupported' || notificationStatus === 'unavailable'
                  ? 'Device notifications are unavailable here. The pet bubble still works.'
                  : 'Optional: send an OS notification while this demo tab stays open.'}
          </span>
          {notificationStatus !== 'granted' && notificationStatus !== 'unsupported' && (
            <button onClick={() => void enableNotifications()}>Enable notifications</button>
          )}
        </div>
        {reminders.length > 0 && (
          <ul className="demo-reminders" aria-label="Pending demo reminders">
            {reminders.map((item) => (
              <li key={item.id}>
                <span>
                  {item.title}
                  {item.url && (
                    <small>
                      {item.openUrlOnDue
                        ? 'Try to open the saved link when due'
                        : 'Saved link · opens when you choose'}
                    </small>
                  )}
                  <small>
                    {new Date(item.dueAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </small>
                </span>
                <button
                  onClick={() =>
                    setReminders((previous) =>
                      previous.filter((reminder) => reminder.id !== item.id),
                    )
                  }
                  aria-label={`Delete reminder ${item.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="demo-boundary">
          This preview needs this tab open and the device awake. Timed links may be blocked by your
          browser; the bubble keeps an Open link action. Snoozing preserves the link but does not
          open it again automatically. Installed reminders use the native app or extension; Google
          Calendar events need the connected extension. Google Tasks is not connected here.
        </p>
        <div className="demo-section-heading">
          <span>02 / A LITTLE SOUNDTRACK</span>
          <h3>Real controls. A tiny local player.</h3>
          <p>
            Two original demo loops. These controls change this player, not a YouTube or Spotify
            tab.
          </p>
        </div>
        <audio
          ref={audio}
          src={TRACKS[track].url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={() =>
            setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)
          }
          onTimeUpdate={() => setCurrentTime(audio.current?.currentTime || 0)}
          onEnded={() => {
            setPlaying(false);
            if (!loop) playTrack((track + 1) % TRACKS.length);
          }}
        />
        <div className="demo-track">
          <span aria-hidden="true">♫</span>
          <div>
            <strong>{TRACKS[track].title}</strong>
            <small>Original Mochi demo audio · {playing ? 'Playing' : 'Ready'}</small>
          </div>
        </div>
        <div className="demo-player-buttons">
          <button
            onClick={() => playTrack((track - 1 + TRACKS.length) % TRACKS.length)}
            aria-label="Previous demo track"
          >
            ↤
          </button>
          <button className="demo-play" onClick={() => (playing ? pauseMusic() : playTrack())}>
            {playing ? 'Ⅱ Pause demo' : '▶ Play demo'}
          </button>
          <button
            onClick={() => playTrack((track + 1) % TRACKS.length)}
            aria-label="Next demo track"
          >
            ↦
          </button>
          <button onClick={stopMusic}>Stop</button>
        </div>
        <label className="demo-range">
          Position{' '}
          <span>
            {clock(currentTime)} / {clock(duration)}
          </span>
          <input
            aria-label="Demo playback position"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={Math.min(currentTime, duration || 1)}
            disabled={!duration}
            onChange={(event) => seek(Number(event.target.value))}
          />
        </label>
        <div className="demo-player-settings">
          <label className="demo-range">
            Volume <span>{volume}%</span>
            <input
              aria-label="Demo volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
          </label>
          <label className="demo-checkbox">
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => changeLoop(event.target.checked)}
            />
            Loop this track
          </label>
        </div>
        <div className="demo-section-heading">
          <span>03 / YOUR KIND OF COMPANY</span>
          <h3>A little space, on your terms.</h3>
        </div>
        <label className="demo-checkbox">
          <input
            type="checkbox"
            checked={following}
            onChange={(event) => {
              setFollowing(event.target.checked);
              lastFollow.current = 0;
            }}
          />
          Follow my cursor inside this preview
        </label>
        <label className="demo-follow-select">
          How often should Mochi follow?
          <select
            value={frequency}
            onChange={(event) => {
              setFrequency(event.target.value as FollowFrequency);
              lastFollow.current = 0;
            }}
          >
            <option value="off">Off</option>
            <option value="rarely">Rarely</option>
            <option value="sometimes">Sometimes — default</option>
            <option value="often">Often</option>
          </select>
        </label>
        <p className="demo-boundary">
          Following is optional. Sometimes keeps the existing gentle pace; Off stops cursor
          following. The desktop app and extension have the same frequency choices in Appearance.
        </p>
      </div>
      {alerts[0] && (
        <aside className="demo-reminder-overlay" aria-label="Mochi reminder" role="region">
          <div className="pixel-dialog reminder-dialog" role="alert">
            <span className="pixel-dialog-name">
              A LITTLE REMINDER {alerts.length > 1 ? `· ${alerts.length} waiting` : ''}
            </span>
            <p>{alerts[0].title}</p>
            {alerts[0].url && (
              <div className="demo-reminder-link">
                {alerts[0].linkStatus === 'blocked' && (
                  <span>
                    Your browser blocked the timed tab. Your reminder is still here; open the link
                    below.
                  </span>
                )}
                {alerts[0].linkStatus === 'opened' && (
                  <span>Sent your saved link to a new tab.</span>
                )}
                <a href={alerts[0].url} target="_blank" rel="noopener noreferrer">
                  Open saved link ↗
                </a>
              </div>
            )}
            <div>
              <button onClick={snooze}>Snooze 5 min</button>
              <button onClick={() => setAlerts((previous) => previous.slice(1))}>Dismiss</button>
            </div>
          </div>
          <button
            className="reminder-pet-button"
            aria-label="Call Mochi to the demo"
            onClick={() => recall(true)}
          >
            <Pet skin={skin} mood="notification" size={128} assetBase={ASSET_BASE} />
          </button>
        </aside>
      )}
    </div>
  );
}
