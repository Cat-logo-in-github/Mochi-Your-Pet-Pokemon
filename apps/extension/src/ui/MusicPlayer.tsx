import { TabMediaControls, MediaIcon, mediaClock } from './TabMediaControls';
import { useEffect, useRef, useState } from 'react';
const tracks = [
  { name: 'Cloud Garden', file: 'cloud-garden.wav' },
  { name: 'Little Afternoon', file: 'little-afternoon.wav' },
];
export function MusicPlayer({ lastUrl }: { lastUrl?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const audibleVolume = useRef(25);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(25);
  const [error, setError] = useState('');
  useEffect(() => {
    const player = audio.current;
    return () => player?.pause();
  }, []);
  async function play() {
    if (!audio.current) return;
    try {
      audio.current.volume = volume / 100;
      if (audio.current.paused) await audio.current.play();
      else audio.current.pause();
      setError('');
    } catch {
      setError('Playback needs a click and available audio output.');
    }
  }
  function change(delta: number) {
    audio.current?.pause();
    setPlaying(false);
    setIndex((index + delta + tracks.length) % tracks.length);
    setTime(0);
    setDuration(0);
    setError('');
  }
  function changeVolume(value: number) {
    setVolume(value);
    if (value > 0) audibleVolume.current = value;
    if (audio.current) audio.current.volume = value / 100;
  }
  return (
    <section className="music-box music-suite" aria-label="Music">
      <TabMediaControls />
      {lastUrl && (
        <a className="text-link media-last-search" href={lastUrl} target="_blank" rel="noreferrer">
          Open last YouTube search ↗
        </a>
      )}
      <details
        className="media-local-demo"
        onToggle={(event) => {
          if (!event.currentTarget.open) {
            audio.current?.pause();
            setPlaying(false);
          }
        }}
      >
        <summary>
          <span>
            <MediaIcon name="music" size={17} />
            Original demo tracks
          </span>
          <small>
            Two local loops <span aria-hidden="true">＋</span>
          </small>
        </summary>
        <div className="media-demo-content">
          <div className="media-demo-heading">
            <div className="media-mini-cover" aria-hidden="true">
              <MediaIcon name="music" size={22} />
            </div>
            <div>
              <strong>{tracks[index].name}</strong>
              <small>Original Mochi audio · {index + 1} of 2</small>
            </div>
            <button
              className="media-icon-button media-demo-play"
              onClick={() => void play()}
              aria-label={playing ? 'Pause demo music' : 'Play demo music'}
            >
              <MediaIcon name={playing ? 'pause' : 'play'} size={18} />
            </button>
          </div>
          <audio
            ref={audio}
            src={chrome.runtime.getURL(`audio/${tracks[index].file}`)}
            preload="none"
            loop={loop}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
            onLoadedMetadata={() => {
              const next = audio.current?.duration || 0;
              setDuration(Number.isFinite(next) && next > 0 ? next : 0);
              if (audio.current) audio.current.volume = volume / 100;
            }}
          />
          <label className="media-progress">
            <span className="sr-only">Seek demo music</span>
            <input
              aria-label="Seek demo music"
              type="range"
              disabled={!duration}
              min="0"
              max={duration || 1}
              step="0.1"
              value={Math.min(time, duration || 1)}
              onChange={(event) => {
                if (audio.current) audio.current.currentTime = Number(event.target.value);
                setTime(Number(event.target.value));
              }}
            />
            <span className="media-time">
              <span>{mediaClock(time)}</span>
              <span>{duration ? mediaClock(duration) : '—:—'}</span>
            </span>
          </label>
          <div className="media-demo-tools">
            <button
              className="media-icon-button"
              onClick={() => change(-1)}
              aria-label="Previous demo track"
            >
              <MediaIcon name="previous" size={17} />
            </button>
            <button
              className="media-icon-button"
              onClick={() => change(1)}
              aria-label="Next demo track"
            >
              <MediaIcon name="next" size={17} />
            </button>
            <button className="media-demo-loop" aria-pressed={loop} onClick={() => setLoop(!loop)}>
              <MediaIcon name="repeat" size={15} />
              Loop
            </button>
            <span className="media-demo-volume">
              <button
                className="media-icon-button"
                aria-label={volume ? 'Mute demo audio' : 'Unmute demo audio'}
                onClick={() => changeVolume(volume ? 0 : audibleVolume.current)}
              >
                <MediaIcon name={volume ? 'volume' : 'muted'} size={16} />
              </button>
              <label>
                <span className="sr-only">Demo volume</span>
                <input
                  aria-label="Demo volume"
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                />
              </label>
              <output>{volume}%</output>
            </span>
          </div>
          {error && (
            <p role="alert" className="media-feedback media-feedback-error">
              {error}
            </p>
          )}
          <p className="media-limit">
            Only these original demo tracks. Closing this section pauses them. Use the main controls
            for your browser player.
          </p>
        </div>
      </details>
    </section>
  );
}
