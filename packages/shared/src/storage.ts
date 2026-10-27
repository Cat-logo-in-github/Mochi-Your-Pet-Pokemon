import type { AppData, HistoryEntry, Lifecycle, Reminder, Settings } from './types';
import { PET_SKINS } from './types';
import { localTimeZone, validTimeZone } from './time';
import { safeUrl, isPrivateGoogleUrl } from './urls';

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  lifecycle: 'running',
  skin: 'eevee',
  size: 88,
  opacity: 1,
  wandering: true,
  following: false,
  followCursorFrequency: 'sometimes',
  bubble: true,
  sound: false,
  compact: false,
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  remindersEnabled: true,
  missedPolicy: 'notify',
  shortcuts: {
    github: 'https://github.com/',
    gmail: 'https://mail.google.com/',
    calendar: 'https://calendar.google.com/',
    youtube: 'https://www.youtube.com/',
    spotify: 'https://open.spotify.com/',
  },
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeSettings(input: unknown): Settings {
  const data = record(input);
  const defaults = DEFAULT_SETTINGS;
  const quiet = record(data.quietHours);
  const validClock = (value: unknown): value is string =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
  const shortcuts: Record<string, string> = {};
  const shortcutData = data.shortcuts === undefined ? defaults.shortcuts : record(data.shortcuts);
  for (const [key, value] of Object.entries(shortcutData).slice(0, 50)) {
    const name = key.toLowerCase().trim();
    if (
      !/^[\p{L}\p{N}][\p{L}\p{N} -]{0,39}$/u.test(name) ||
      ['constructor', 'prototype', '__proto__'].includes(name)
    ) {
      continue;
    }
    const url = typeof value === 'string' ? safeUrl(value) : null;
    if (url) shortcuts[name] = url;
  }
  return {
    version: 1,
    lifecycle: choice(
      data.lifecycle,
      ['running', 'paused', 'hidden', 'disabled'],
      defaults.lifecycle,
    ),
    skin: choice(data.skin, PET_SKINS, defaults.skin),
    size: bounded(data.size, defaults.size, 48, 180),
    opacity: bounded(data.opacity, defaults.opacity, 0.25, 1),
    wandering: flag(data.wandering, defaults.wandering),
    following: flag(data.following, defaults.following),
    followCursorFrequency: choice(
      data.followCursorFrequency,
      ['off', 'rarely', 'sometimes', 'often'],
      defaults.followCursorFrequency,
    ),
    bubble: flag(data.bubble, defaults.bubble),
    sound: flag(data.sound, defaults.sound),
    compact: flag(data.compact, defaults.compact),
    quietHours: {
      enabled: flag(quiet.enabled, defaults.quietHours.enabled),
      start: validClock(quiet.start) ? quiet.start : defaults.quietHours.start,
      end: validClock(quiet.end) ? quiet.end : defaults.quietHours.end,
    },
    remindersEnabled: flag(data.remindersEnabled, defaults.remindersEnabled),
    missedPolicy: choice(data.missedPolicy, ['notify', 'skip', 'catch-up'], defaults.missedPolicy),
    shortcuts,
  };
}

export function createDefaultData(): AppData {
  return {
    settings: normalizeSettings(DEFAULT_SETTINGS),
    reminders: [],
    history: [],
    positions: {},
    diagnostics: [],
    catchUp: [],
  };
}

export function isReminder(value: unknown): value is Reminder {
  const reminder = record(value);
  return (
    typeof reminder.id === 'string' &&
    /^[\w.:@-]{1,256}$/u.test(reminder.id) &&
    typeof reminder.title === 'string' &&
    reminder.title.trim().length > 0 &&
    reminder.title.length <= 500 &&
    typeof reminder.dueAt === 'number' &&
    Number.isSafeInteger(reminder.dueAt) &&
    reminder.dueAt >= 0 &&
    reminder.dueAt < 8_640_000_000_000_000 &&
    validTimeZone(reminder.timeZone) &&
    ['none', 'daily', 'weekly'].includes(String(reminder.recurrence)) &&
    (reminder.recurrenceTime === undefined ||
      (typeof reminder.recurrenceTime === 'string' &&
        /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/u.test(reminder.recurrenceTime))) &&
    typeof reminder.paused === 'boolean' &&
    typeof reminder.completed === 'boolean' &&
    (reminder.lastDeliveredAt === undefined ||
      (typeof reminder.lastDeliveredAt === 'number' &&
        Number.isSafeInteger(reminder.lastDeliveredAt) &&
        reminder.lastDeliveredAt >= 0)) &&
    (reminder.source === undefined || ['local', 'calendar'].includes(String(reminder.source))) &&
    (reminder.eventId === undefined ||
      (typeof reminder.eventId === 'string' && reminder.eventId.length <= 512)) &&
    (reminder.openUrlOnDue === undefined || typeof reminder.openUrlOnDue === 'boolean') &&
    (reminder.openUrlOnDue !== true ||
      (reminder.source === 'local' &&
        typeof reminder.url === 'string' &&
        safeUrl(reminder.url) !== null)) &&
    (reminder.url === undefined ||
      (typeof reminder.url === 'string' && safeUrl(reminder.url) !== null))
  );
}

function sanitizeReminder(reminder: Reminder): Reminder {
  return {
    id: reminder.id,
    title: reminder.source === 'calendar' ? 'Calendar event' : reminder.title.trim(),
    dueAt: reminder.dueAt,
    timeZone: reminder.timeZone,
    recurrence: reminder.recurrence,
    ...(reminder.recurrenceTime === undefined ? {} : { recurrenceTime: reminder.recurrenceTime }),
    paused: reminder.paused,
    completed: reminder.completed,
    ...(reminder.lastDeliveredAt === undefined
      ? {}
      : { lastDeliveredAt: reminder.lastDeliveredAt }),
    ...(reminder.source === undefined ? {} : { source: reminder.source }),
    ...(reminder.eventId === undefined || reminder.source === 'calendar'
      ? {}
      : { eventId: reminder.eventId }),
    ...(reminder.url === undefined
      ? {}
      : {
          url:
            reminder.source === 'calendar'
              ? 'https://calendar.google.com/'
              : (safeUrl(reminder.url) ?? undefined),
        }),
    ...(reminder.openUrlOnDue === undefined ? {} : { openUrlOnDue: reminder.openUrlOnDue }),
  };
}

function normalizedReminders(input: unknown): Reminder[] {
  const values = Array.isArray(input) ? input : [];
  const ids = new Set<string>();
  return values
    .filter(isReminder)
    .filter((value) => {
      if (ids.has(value.id)) return false;
      ids.add(value.id);
      return true;
    })
    .slice(0, 1000)
    .map(sanitizeReminder);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  const entry = record(value);
  return (
    typeof entry.id === 'string' &&
    entry.id.length <= 256 &&
    typeof entry.command === 'string' &&
    entry.command.length <= 500 &&
    typeof entry.url === 'string' &&
    safeUrl(entry.url) !== null &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

/** Tolerant storage migration: unknown fields are dropped and broken entries isolated. */
export function normalizeData(input: unknown): AppData {
  const data = record(input);
  const positions: AppData['positions'] = {};
  for (const [key, raw] of Object.entries(record(data.positions)).slice(0, 100)) {
    const position = record(raw);
    if (/^[\w-]{1,80}$/u.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)) {
      positions[key] = {
        x: bounded(position.x, 0.8, 0, 1),
        y: bounded(position.y, 0.8, 0, 1),
      };
    }
  }
  return {
    settings: normalizeSettings(data.settings ?? data),
    reminders: normalizedReminders(data.reminders),
    history: (Array.isArray(data.history) ? data.history : [])
      .filter(isHistoryEntry)
      .filter((entry) => !isPrivateGoogleUrl(entry.url))
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((entry) => ({
        id: entry.id,
        command: entry.command,
        url: safeUrl(entry.url)!,
        at: entry.at,
      })),
    positions,
    diagnostics: (Array.isArray(data.diagnostics) ? data.diagnostics : [])
      .map(record)
      .filter(
        (item) =>
          typeof item.at === 'number' &&
          Number.isFinite(item.at) &&
          typeof item.message === 'string',
      )
      .sort((a, b) => (b.at as number) - (a.at as number))
      .slice(0, 100)
      .map((item) => ({ at: item.at as number, message: (item.message as string).slice(0, 500) })),
    catchUp: normalizedReminders(data.catchUp),
  };
}

/** Import rejects unsafe or damaged schedules instead of silently dropping user data. */
export function validateImport(input: unknown): AppData {
  const encoded = JSON.stringify(input);
  if (!encoded || new TextEncoder().encode(encoded).byteLength > 2_000_000)
    throw new Error('Backup must be smaller than 2 MB.');
  const outer = record(input);
  const data = record(outer.data ?? input);
  const settings = record(data.settings);
  if (!data.settings || (settings.version !== undefined && settings.version !== 1)) {
    throw new Error('This backup uses an unsupported Mochi settings version.');
  }
  for (const collection of ['reminders', 'catchUp'] as const) {
    if (data[collection] !== undefined) {
      const values = data[collection];
      if (
        !Array.isArray(values) ||
        values.length > 1000 ||
        values.some((value) => !isReminder(value))
      ) {
        throw new Error('Backup contains an invalid reminder.');
      }
      const ids = values.map((value) => (value as Reminder).id);
      if (new Set(ids).size !== ids.length)
        throw new Error('Backup contains duplicate reminder IDs.');
    }
  }
  const shortcuts = record(settings.shortcuts);
  if (
    Object.keys(shortcuts).length > 50 ||
    Object.values(shortcuts).some((url) => typeof url !== 'string' || !safeUrl(url))
  ) {
    throw new Error('Backup contains an unsafe website shortcut.');
  }
  if (
    data.history !== undefined &&
    (!Array.isArray(data.history) || data.history.some((value) => !isHistoryEntry(value)))
  ) {
    throw new Error('Backup contains an invalid command history entry.');
  }
  const imported = normalizeData(data);
  // Backups restore schedules and links, never permission to launch pages.
  for (const reminder of [...imported.reminders, ...imported.catchUp]) delete reminder.openUrlOnDue;
  return imported;
}

export function transitionLifecycle(_current: Lifecycle, next: Lifecycle): Lifecycle {
  return next;
}

export function newReminder(title: string, dueAt: number, timeZone = localTimeZone()): Reminder {
  const reminder: Reminder = {
    id: crypto.randomUUID(),
    title: title.trim(),
    dueAt,
    timeZone,
    recurrence: 'none',
    paused: false,
    completed: false,
    source: 'local',
  };
  if (!isReminder(reminder)) throw new Error('Choose a valid reminder title, date, and timezone.');
  return reminder;
}
