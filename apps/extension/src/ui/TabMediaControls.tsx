import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MediaCommand, MediaState } from '@mochi/shared';
import { request } from '../client';

type IconName =
  'play' | 'pause' | 'previous' | 'next' | 'volume' | 'muted' | 'repeat' | 'refresh' | 'music';
export function MediaIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    play: 'M8 5l11 7-11 7z',
    pause: 'M8 5v14M16 5v14',
    previous: 'M6 5v14M18 5l-10 7 10 7z',
    next: 'M18 5v14M6 5l10 7-10 7z',
    volume: 'M11 5L6 9H3v6h3l5 4zM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14',
    muted: 'M11 5L6 9H3v6h3l5 4zM16 9l6 6M22 9l-6 6',
    repeat: 'M4 9V7a3 3 0 013-3h12l-3-3M19 4l-3 3M20 15v2a3 3 0 01-3 3H5l3 3M5 20l3-3',
    refresh: 'M20 8a8 8 0 10.2 7M20 3v5h-5',
    music:
      'M9 18V5l11-2v13M9 8l11-2M9 18a3 2 0 11-3-2 3 2 0 013 2zM20 16a3 2 0 11-3-2 3 2 0 013 2z',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'pause' ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export const mediaClock = (value: number) => {
  const seconds = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const commitKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);
export function TabMediaControls() {
  const [state, setState] = useState<MediaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'Start a song or video in a browser tab, then find its player.',
  );
  const [failed, setFailed] = useState(false);
  const [volume, setVolume] = useState(50);
  const [seek, setSeek] = useState(0);
  const audibleVolume = useRef(50);
  const duration =
    state?.duration && Number.isFinite(state.duration) && state.duration > 0 ? state.duration : 0;
  async function control(command: MediaCommand) {
    if (busy) return;
    setBusy(true);
    const failure = (text: string) => {
      setFailed(true);
      setMessage(text);
      if (state) {
        setVolume(state.volume);
        setSeek(state.currentTime);
      }
    };
    try {
      const result = await request({ type: 'media', command });
      if (!result.ok) {
        failure(result.error);
        return;
      }
      if (!result.media?.ok) {
        failure(result.media?.error || 'No player state was returned. Find the player again.');
        return;
      }
      const next = result.media.state;
      setState(next);
      setVolume(next.volume);
      setSeek(next.currentTime);
      if (next.volume > 0) audibleVolume.current = next.volume;
      setFailed(false);
      setMessage(result.message || result.media.message || 'Playback updated.');
    } catch {
      failure('The player connection was interrupted. Find the player and try again.');
    } finally {
      setBusy(false);
    }
  }
  function commitRange(event: KeyboardEvent<HTMLInputElement>, action: 'seek' | 'volume') {
    if (commitKeys.has(event.key))
      void control({ action, value: Number(event.currentTarget.value) });
  }
  return (
    <section
      className="tab-media-controls media-card"
      aria-label="Browser tab playback"
      aria-busy={busy}
    >
      <div className="media-card-heading">
        <div>
          <span className="eyebrow">A LITTLE SOUNDTRACK</span>
          <h3>Your playing tab</h3>
        </div>
        <button
          className="media-refresh"
          disabled={busy}
          onClick={() => void control({ action: 'status' })}
          aria-label="Find player"
        >
          <MediaIcon name="refresh" size={15} />
          <span>{busy ? 'Finding…' : state ? 'Refresh' : 'Find player'}</span>
        </button>
      </div>
      <div className="media-current">
        <div className="media-cover" aria-hidden="true">
          <MediaIcon name="music" size={31} />
          <i>✧</i>
        </div>
        <div className="media-current-copy">
          <span className="media-provider">BROWSER PLAYER</span>
          <h4 className="media-track-title" title={state?.title}>
            {state?.title || 'Room for your favorite song.'}
          </h4>
          <span className={`media-state ${failed ? 'media-state-error' : ''}`}>
            <i />
            {busy
              ? 'Updating player'
              : failed
                ? 'Needs a refresh'
                : state
                  ? state.paused
                    ? 'Paused'
                    : 'Playing'
                  : 'Not connected yet'}
          </span>
        </div>
      </div>
      <div className="media-transport">
        <button
          className="media-icon-button"
          disabled={busy || !state?.canPrevious}
          aria-label="Previous tab track"
          title="Previous track"
          onClick={() => void control({ action: 'previous' })}
        >
          <MediaIcon name="previous" />
        </button>
        <button
          className="media-main-play"
          disabled={busy || !state}
          aria-label={
            state
              ? state.paused
                ? 'Play tab audio'
                : 'Pause tab audio'
              : 'Play or pause current tab'
          }
          onClick={() => void control({ action: 'toggle' })}
        >
          <MediaIcon name={state?.paused === false ? 'pause' : 'play'} size={25} />
        </button>
        <button
          className="media-icon-button"
          disabled={busy || !state?.canNext}
          aria-label="Next tab track"
          title="Next track"
          onClick={() => void control({ action: 'next' })}
        >
          <MediaIcon name="next" />
        </button>
        <button
          className="media-icon-button media-loop"
          disabled={busy || !state}
          aria-label="Loop tab"
          title="Loop this track"
          aria-pressed={state?.loop || false}
          onClick={() => void control({ action: 'loop' })}
        >
          <MediaIcon name="repeat" size={18} />
        </button>
      </div>
      <label className="media-progress">
        <span className="sr-only">Tab position</span>
        <input
          aria-label="Tab playback position"
          type="range"
          disabled={busy || !state?.canSeek || !duration}
          min="0"
          max={duration || 1}
          step="0.1"
          value={duration ? Math.max(0, Math.min(seek, duration)) : 0}
          onChange={(event) => setSeek(Number(event.target.value))}
          onPointerUp={(event) =>
            void control({ action: 'seek', value: Number(event.currentTarget.value) })
          }
          onKeyUp={(event) => commitRange(event, 'seek')}
        />
        <span className="media-time">
          <span>{mediaClock(seek)}</span>
          <span>{duration ? mediaClock(duration) : state ? 'Live / unknown' : '—:—'}</span>
        </span>
      </label>
      <div className="media-volume-row">
        <button
          className="media-icon-button"
          disabled={busy || !state}
          aria-label={volume ? 'Mute tab audio' : 'Unmute tab audio'}
          title={volume ? 'Mute' : 'Unmute'}
          onClick={() =>
            void control({ action: 'volume', value: volume ? 0 : audibleVolume.current })
          }
        >
          <MediaIcon name={volume ? 'volume' : 'muted'} size={18} />
        </button>
        <label>
          <span className="sr-only">Tab volume</span>
          <input
            aria-label="Tab volume"
            type="range"
            disabled={busy || !state}
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            onPointerUp={(event) =>
              void control({ action: 'volume', value: Number(event.currentTarget.value) })
            }
            onKeyUp={(event) => commitRange(event, 'volume')}
          />
        </label>
        <output aria-label="Tab volume value">{volume}%</output>
      </div>
      <p
        role={failed ? 'alert' : 'status'}
        className={`media-feedback ${failed ? 'media-feedback-error' : ''}`}
      >
        {busy ? 'Asking your browser player…' : message}
      </p>
      <p className="media-limit">
        Updates on request. Protected players may refuse control; next/previous need supported site
        buttons.
      </p>
    </section>
  );
}
