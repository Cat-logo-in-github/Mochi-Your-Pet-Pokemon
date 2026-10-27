import { isMediaCommand } from '@mochi/shared';
import type { MediaCommand, MediaResult, MediaState } from '@mochi/shared';
function mediaElements(): HTMLMediaElement[] {
  return [...document.querySelectorAll<HTMLMediaElement>('audio,video')]
    .slice(0, 30)
    .filter((media) => !media.error)
    .sort((a, b) => Number(!b.paused && !b.muted) - Number(!a.paused && !a.muted));
}
function trackButton(action: 'next' | 'previous'): HTMLButtonElement | null {
  const host = location.hostname;
  const selectors = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)
    ? action === 'next'
      ? '.ytp-next-button'
      : '.ytp-prev-button'
    : host === 'open.spotify.com'
      ? `[data-testid="control-button-skip-${action === 'next' ? 'forward' : 'back'}"]`
      : '';
  const button = selectors ? document.querySelector<HTMLButtonElement>(selectors) : null;
  return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    ? button
    : null;
}
export function readMediaState(): MediaState | null {
  const media = mediaElements()[0];
  if (!media) return null;
  const duration = Number.isFinite(media.duration) && media.duration >= 0 ? media.duration : null;
  return {
    title: document.title.trim().slice(0, 180) || 'Media tab',
    paused: media.paused,
    currentTime: Number.isFinite(media.currentTime) ? Math.max(0, media.currentTime) : 0,
    duration,
    volume: Math.round(media.volume * 100),
    loop: media.loop,
    canSeek: duration !== null && duration > 0,
    canNext: !!trackButton('next'),
    canPrevious: !!trackButton('previous'),
  };
}
export async function controlPageMedia(command: MediaCommand): Promise<MediaResult> {
  if (!isMediaCommand(command)) return { ok: false, error: 'Invalid media control.' };
  const media = mediaElements()[0];
  if (!media)
    return {
      ok: false,
      error: 'This frame has no controllable audio or video. Open the player tab first.',
    };
  try {
    const action = command.action;
    if (action === 'play' || (action === 'toggle' && media.paused)) {
      await Promise.race([
        media.play(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error('The site did not confirm playback. Click its player once, then retry.'),
              ),
            2500,
          ),
        ),
      ]);
      if (media.paused)
        return {
          ok: false,
          error: 'The site did not start playback. Click its player once, then retry.',
        };
    } else if (action === 'pause' || action === 'toggle') {
      media.pause();
      if (!media.paused) return { ok: false, error: 'The site did not confirm pausing.' };
    } else if (action === 'seek') {
      if (!Number.isFinite(media.duration) || media.duration <= 0)
        return { ok: false, error: 'This live or protected player cannot seek.' };
      const target = Math.min(media.duration, command.value as number);
      media.currentTime = target;
      if (Math.abs(media.currentTime - target) > 1)
        return { ok: false, error: 'The player refused that seek position.' };
    } else if (action === 'volume') {
      media.volume = (command.value as number) / 100;
      if (media.volume > 0) media.muted = false;
      if (Math.abs(media.volume * 100 - (command.value as number)) > 1)
        return { ok: false, error: 'The player refused the volume change.' };
    } else if (action === 'loop') {
      media.loop = typeof command.value === 'boolean' ? command.value : !media.loop;
    } else if (action === 'next' || action === 'previous') {
      const button = trackButton(action);
      if (!button)
        return {
          ok: false,
          error:
            'This site does not expose a supported next/previous track control. Use its player for track changes.',
        };
      const before = [media.currentSrc, location.href, document.title].join('|');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      if ([media.currentSrc, location.href, document.title].join('|') === before)
        return {
          ok: false,
          error:
            'The site has not confirmed the track change. Use its player if the track does not change.',
        };
    }
    const state = readMediaState();
    if (!state) return { ok: false, error: 'The player closed before its status could be read.' };
    const messages: Record<string, string> = {
      status: 'Player found.',
      play: 'Playback started.',
      pause: 'Playback paused.',
      toggle: state.paused ? 'Playback paused.' : 'Playback started.',
      seek: 'Playback position updated.',
      volume: 'Tab volume updated.',
      loop: state.loop ? 'Loop enabled.' : 'Loop disabled.',
      next: 'Next track started.',
      previous: 'Previous track started.',
    };
    return { ok: true, state, message: messages[action] };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 400)
          : 'The site refused this playback control.',
    };
  }
}
export function installMediaBridge(): () => void {
  const listener = (
    raw: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (result: unknown) => void,
  ) => {
    if (sender.id !== chrome.runtime.id || !raw || typeof raw !== 'object') return false;
    const message = raw as Record<string, unknown>;
    if (
      message.type === 'mochi-media-probe' &&
      typeof message.requestId === 'string' &&
      /^[\w-]{1,80}$/u.test(message.requestId)
    ) {
      const state = readMediaState();
      if (state)
        void chrome.runtime
          .sendMessage({ type: 'media-report', requestId: message.requestId, state })
          .catch(() => undefined);
      respond({ ok: true });
      return false;
    }
    if (message.type === 'mochi-media-control' && isMediaCommand(message.command)) {
      void controlPageMedia(message.command).then(respond);
      return true;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) installMediaBridge();
