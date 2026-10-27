import type { Reminder, Settings } from './types';

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function wallParts(epoch: number, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(epoch);
  const value = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function wallEpoch(parts: WallTime): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Earlier occurrence for repeated wall times; shift forward across a DST gap. */
export function zonedTimeToEpoch(parts: WallTime, timeZone: string): number {
  if (!validTimeZone(timeZone)) throw new Error('Choose a valid IANA timezone.');
  const target = wallEpoch(parts);
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const instant = target + delta * 3_600_000;
    offsets.add(wallEpoch(wallParts(instant, timeZone)) - instant);
  }
  const candidates = [...offsets].map((offset) => target - offset);
  const exact = candidates.filter(
    (candidate) => wallEpoch(wallParts(candidate, timeZone)) === target,
  );
  if (exact.length) return Math.min(...exact);
  const afterGap = candidates
    .map((candidate) => ({
      candidate,
      distance: wallEpoch(wallParts(candidate, timeZone)) - target,
    }))
    .filter(({ distance }) => distance > 0)
    .sort((a, b) => a.distance - b.distance);
  if (!afterGap[0]) throw new Error('This local date cannot be scheduled.');
  return afterGap[0].candidate;
}

export function parseLocalDateTime(value: string, timeZone = localTimeZone()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) throw new Error('Choose a date and time.');
  const parts: WallTime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const date = new Date(wallEpoch(parts));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() + 1 !== parts.month ||
    date.getUTCDate() !== parts.day ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  ) {
    throw new Error('Choose a valid calendar date and time.');
  }
  return zonedTimeToEpoch(parts, timeZone);
}

export function recurrenceTime(reminder: Reminder): string {
  if (reminder.recurrenceTime) return reminder.recurrenceTime;
  const wall = wallParts(
    reminder.dueAt,
    validTimeZone(reminder.timeZone) ? reminder.timeZone : 'UTC',
  );
  return [wall.hour, wall.minute, wall.second]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function nextOccurrence(reminder: Reminder, after: number): number {
  if (reminder.recurrence === 'none') return reminder.dueAt > after ? reminder.dueAt : Infinity;
  const zone = validTimeZone(reminder.timeZone) ? reminder.timeZone : 'UTC';
  const anchor = wallParts(reminder.dueAt, zone);
  const [hour, minute, second] = recurrenceTime(reminder).split(':').map(Number);
  anchor.hour = hour;
  anchor.minute = minute;
  anchor.second = second;
  if (reminder.dueAt > after) return reminder.dueAt;
  const step = reminder.recurrence === 'weekly' ? 7 : 1;
  const afterParts = wallParts(after, zone);
  const anchorDay = Date.UTC(anchor.year, anchor.month - 1, anchor.day);
  const afterDay = Date.UTC(afterParts.year, afterParts.month - 1, afterParts.day);
  let days = Math.max(step, Math.floor((afterDay - anchorDay) / (86_400_000 * step)) * step);
  for (let attempt = 0; attempt < 4; attempt++, days += step) {
    const date = new Date(anchorDay + days * 86_400_000);
    const candidate = zonedTimeToEpoch(
      {
        ...anchor,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      },
      zone,
    );
    if (candidate > after) return candidate;
  }
  throw new Error('Unable to find the next reminder occurrence.');
}

export function isQuietHours(settings: Settings, date = new Date()): boolean {
  if (!settings.quietHours.enabled) return false;
  const minute = date.getHours() * 60 + date.getMinutes();
  const toMinute = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  const start = toMinute(settings.quietHours.start);
  const end = toMinute(settings.quietHours.end);
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
