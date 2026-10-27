import type { MediaCommand, MediaResult } from './types';
export function isMediaCommand(value: unknown): value is MediaCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  if (
    !['status', 'play', 'pause', 'toggle', 'next', 'previous', 'seek', 'volume', 'loop'].includes(
      String(c.action),
    )
  )
    return false;
  if (c.action === 'seek' || c.action === 'volume')
    return (
      typeof c.value === 'number' &&
      Number.isFinite(c.value) &&
      c.value >= 0 &&
      c.value <= (c.action === 'volume' ? 100 : 864000)
    );
  if (c.action === 'loop') return c.value === undefined || typeof c.value === 'boolean';
  return c.value === undefined;
}
export function isMediaResult(value: unknown): value is MediaResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.ok === false) return typeof v.error === 'string' && v.error.length <= 500;
  if (
    v.ok !== true ||
    typeof v.message !== 'string' ||
    v.message.length > 500 ||
    !v.state ||
    typeof v.state !== 'object'
  )
    return false;
  const s = v.state as Record<string, unknown>;
  return (
    typeof s.title === 'string' &&
    s.title.length <= 180 &&
    typeof s.paused === 'boolean' &&
    typeof s.currentTime === 'number' &&
    Number.isFinite(s.currentTime) &&
    s.currentTime >= 0 &&
    (s.duration === null ||
      (typeof s.duration === 'number' && Number.isFinite(s.duration) && s.duration >= 0)) &&
    typeof s.volume === 'number' &&
    Number.isFinite(s.volume) &&
    s.volume >= 0 &&
    s.volume <= 100 &&
    ['loop', 'canSeek', 'canNext', 'canPrevious'].every((k) => typeof s[k] === 'boolean')
  );
}
