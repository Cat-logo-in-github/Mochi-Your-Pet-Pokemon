import { describe, expect, it } from 'vitest';
import {
  claimDelivery,
  collectDue,
  createDefaultData,
  DEFAULT_SETTINGS,
  PET_SKINS,
  demoCapabilities,
  isQuietHours,
  isRestrictedUrl,
  isReminder,
  nextOccurrence,
  normalizeData,
  normalizeSettings,
  parseCommand,
  parseLocalDateTime,
  safeUrl,
  transitionLifecycle,
  validateImport,
  youtubeProvider,
  youtubeSearch,
  type Reminder,
} from '../packages/shared/src/index';

const now = Date.parse('2026-10-25T08:00:00Z');
const reminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'test-reminder',
  title: 'Stretch',
  dueAt: now,
  timeZone: 'UTC',
  recurrence: 'none',
  paused: false,
  completed: false,
  ...patch,
});

describe('safe navigation and deterministic command parsing', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///private',
    'https://google.com@evil.example/',
    'https://user:pass@example.com',
    'https://example.com\\@evil.example',
    'https://example.com/\npath',
    '//evil.example',
    'chrome://extensions',
    'https://example.com/\u0000',
  ])('rejects an unsafe destination: %s', (value) => {
    expect(safeUrl(value)).toBeNull();
  });

  it('accepts explicit HTTP(S) and normalizes its display destination', () => {
    expect(safeUrl('https://EXAMPLE.com:443/path?q=one%20two')).toBe(
      'https://example.com/path?q=one%20two',
    );
    expect(safeUrl('http://localhost:8080/')).toBe('http://localhost:8080/');
  });

  it('encodes song titles and artists into a YouTube search without claiming playback', () => {
    const result = parseCommand('  Play   Mercy by Shawn Mendes.  ');
    expect(result).toEqual({
      kind: 'navigate',
      label: 'Search YouTube for Mercy by Shawn Mendes',
      url: youtubeSearch('Mercy', 'Shawn Mendes'),
    });
    expect(new URL(youtubeSearch('A & B?#')).searchParams.get('search_query')).toBe(
      'A & B?# full song',
    );
    expect(parseCommand('Open YouTube and search for Mercy full song.')).toMatchObject({
      kind: 'navigate',
    });
  });

  it('routes only explicit user shortcuts and safe full URLs', () => {
    expect(parseCommand('go to GitHub!')).toMatchObject({
      kind: 'navigate',
      url: 'https://github.com/',
    });
    expect(parseCommand('open work', now, { work: 'https://example.com/project' })).toMatchObject({
      kind: 'navigate',
      url: 'https://example.com/project',
    });
    expect(parseCommand('open javascript:alert(1)')).toMatchObject({ kind: 'clarify' });
    expect(parseCommand('open constructor')).toMatchObject({ kind: 'clarify' });
    expect(parseCommand('open unknown destination')).toMatchObject({ kind: 'clarify' });
  });

  it.each([
    ['pause the pet', { kind: 'lifecycle', value: 'paused' }],
    ['resume the pet', { kind: 'lifecycle', value: 'running' }],
    ['hide the pet', { kind: 'lifecycle', value: 'hidden' }],
    ['show the pet', { kind: 'lifecycle', value: 'running' }],
    ['shut down Mochi', { kind: 'lifecycle', value: 'disabled' }],
    ['stop following my cursor', { kind: 'preference', key: 'following', value: false }],
    ['follow my cursor', { kind: 'preference', key: 'following', value: true }],
    ['stop wandering', { kind: 'preference', key: 'wandering', value: false }],
  ])('routes %s', (command, expected) => {
    expect(parseCommand(command as string)).toEqual(expected);
  });

  it.each([
    ['pause the music', { kind: 'music', action: 'pause' }],
    ['resume music', { kind: 'music', action: 'resume' }],
    ['next track', { kind: 'music', action: 'next' }],
    ['previous track', { kind: 'music', action: 'previous' }],
    ['loop this track', { kind: 'music', action: 'loop', value: true }],
    ['turn loop off', { kind: 'music', action: 'loop', value: false }],
    ['set volume to 30', { kind: 'music', action: 'volume', value: 30 }],
    ['seek to 15 seconds', { kind: 'music', action: 'seek', value: 15 }],
  ])('parses music capability requests without executing: %s', (command, expected) => {
    expect(parseCommand(command as string)).toEqual(expected);
  });

  it.each(['come here', 'call mochi', 'here kitty', 'come here mochi'])(
    'recalls the pet for the exact safe phrase %s',
    (command) => {
      expect(parseCommand(command)).toEqual({ kind: 'summon' });
      expect(parseCommand(`  ${command.toUpperCase()}!  `)).toEqual({ kind: 'summon' });
    },
  );

  it('does not treat embedded recall words or trailing instructions as a pet recall', () => {
    for (const command of [
      'come here and open javascript:alert(1)',
      'call mochi; delete my files',
      'here kitty then open Gmail',
    ]) {
      expect(parseCommand(command).kind).toBe('clarify');
    }
    expect(parseCommand('play Come Here by Artist').kind).toBe('navigate');
  });

  it('separates music and pet pause commands and validates volume', () => {
    expect(parseCommand('pause the music').kind).toBe('music');
    expect(parseCommand('pause the pet').kind).toBe('lifecycle');
    expect(parseCommand('volume 101').kind).toBe('clarify');
  });

  it('parses relative reminders in both documented word orders', () => {
    expect(parseCommand('remind me in 10 minutes to join the meeting.', now)).toMatchObject({
      kind: 'reminder',
      title: 'join the meeting',
      dueAt: now + 600_000,
    });
    expect(parseCommand('Remind me about my meeting in 10 minutes', now)).toMatchObject({
      kind: 'reminder',
      title: 'my meeting',
      dueAt: now + 600_000,
    });
    expect(parseCommand('remind me in 1.5 hours to call Alex', now)).toMatchObject({
      dueAt: now + 5_400_000,
    });
    expect(parseCommand('remind me in 0 minutes to stretch', now).kind).toBe('clarify');
    expect(parseCommand('remind me in 99999999 weeks to stretch', now).kind).toBe('clarify');
  });

  it('parses tomorrow in local calendar time, including noon and midnight', () => {
    const noon = parseCommand('remind me tomorrow at 12 PM to call Alex', now);
    const midnight = parseCommand('remind me tomorrow at 12 AM to sleep', now);
    if (noon.kind !== 'reminder' || midnight.kind !== 'reminder')
      throw new Error('Expected reminders');
    expect(new Date(noon.dueAt).getHours()).toBe(12);
    expect(new Date(midnight.dueAt).getHours()).toBe(0);
    expect(new Date(noon.dueAt).getDate()).toBe(new Date(now).getDate() + 1);
    expect(parseCommand('remind me tomorrow at 25:90 to call Alex', now).kind).toBe('clarify');
  });

  it('asks one clear question for missing parameters or unsupported instructions', () => {
    for (const text of [
      '',
      'play',
      'open',
      'remind me in 10 minutes',
      'delete all emails',
      'send an email to Alex',
      '<script>alert(1)</script>',
    ]) {
      expect(parseCommand(text).kind).toBe('clarify');
    }
    expect(parseCommand('x'.repeat(501)).kind).toBe('clarify');
    expect(parseCommand("What's on my calendar today?").kind).toBe('calendar');
    expect(parseCommand('check email').kind).toBe('email');
  });

  it('declares external YouTube controls unsupported and local player capabilities separately', () => {
    expect(Object.values(youtubeProvider.capabilities).every((value) => value === false)).toBe(
      true,
    );
    expect(demoCapabilities.canPause).toBe(true);
    expect(demoCapabilities.canChangeTrack).toBe(true);
  });

  it.each([
    'chrome://settings',
    'edge://extensions',
    'about:blank',
    'https://chromewebstore.google.com/detail/x',
    'https://microsoftedge.microsoft.com/addons/detail/x',
  ])('recognizes restricted overlay pages: %s', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });
  it('does not mistake ordinary websites for stores', () => {
    expect(isRestrictedUrl('https://example.com/')).toBe(false);
    expect(isRestrictedUrl('https://developer.chrome.com/')).toBe(false);
  });
});

describe('durable reminder calculations and deduplication', () => {
  it('claims a one-time delivery once and keeps its definition', () => {
    const first = claimDelivery(reminder(), now);
    expect(first.notify).toBe(true);
    expect(first.key).toBe(`test-reminder:${now}`);
    expect(first.reminder.completed).toBe(true);
    expect(claimDelivery(first.reminder, now + 1).notify).toBe(false);
    expect(first.reminder.title).toBe('Stretch');
  });

  it('suppresses replay of the same already claimed occurrence after a worker restart', () => {
    expect(claimDelivery(reminder({ lastDeliveredAt: now }), now).notify).toBe(false);
    const recurring = claimDelivery(reminder({ recurrence: 'daily', lastDeliveredAt: now }), now);
    expect(recurring.notify).toBe(false);
    expect(recurring.reminder.dueAt).toBe(now + 86_400_000);
  });

  it('supports notify, skip, and catch-up missed reminder policies', () => {
    expect(claimDelivery(reminder(), now + 120_000, 'notify').notify).toBe(true);
    expect(claimDelivery(reminder(), now + 120_000, 'skip').notify).toBe(false);
    const caught = claimDelivery(reminder(), now + 120_000, 'catch-up');
    expect(caught.catchUp).toBe(true);
    expect(caught.notify).toBe(false);
    expect(caught.reminder.completed).toBe(true);
  });

  it('does not claim paused, completed, or future reminders', () => {
    for (const entry of [
      reminder({ paused: true }),
      reminder({ completed: true }),
      reminder({ dueAt: now + 1 }),
    ]) {
      expect(claimDelivery(entry, now)).toEqual({
        reminder: entry,
        notify: false,
        catchUp: false,
        key: null,
      });
    }
  });

  it('collects notifications independently from advanced persisted definitions', () => {
    const result = collectDue([reminder(), reminder({ id: 'future', dueAt: now + 1000 })], now);
    expect(result.due).toHaveLength(1);
    expect(result.due[0].completed).toBe(false);
    expect(result.reminders[0].completed).toBe(true);
    expect(collectDue(result.reminders, now).due).toHaveLength(0);
  });

  it('deduplicates duplicate stored definitions before claiming delivery', () => {
    const result = collectDue([reminder(), reminder()], now);
    expect(result.due).toHaveLength(1);
    expect(result.reminders).toHaveLength(1);
  });

  it('skips missed recurring occurrences without a notification storm', () => {
    const weekly = reminder({ recurrence: 'weekly' });
    const after = now + 30 * 86_400_000;
    const next = nextOccurrence(weekly, after);
    expect(next).toBe(now + 35 * 86_400_000);
    expect(nextOccurrence(reminder(), now)).toBe(Infinity);
    expect(nextOccurrence(reminder({ dueAt: now + 1 }), now)).toBe(now + 1);
  });

  it('keeps the local wall-clock hour across a spring DST transition', () => {
    const spring = reminder({
      dueAt: Date.parse('2026-03-07T14:00:00Z'),
      timeZone: 'America/New_York',
      recurrence: 'daily',
    });
    expect(nextOccurrence(spring, spring.dueAt)).toBe(Date.parse('2026-03-08T13:00:00Z'));
  });

  it('keeps the local wall-clock hour across a fall DST transition', () => {
    const fall = reminder({
      dueAt: Date.parse('2026-10-31T13:00:00Z'),
      timeZone: 'America/New_York',
      recurrence: 'daily',
    });
    expect(nextOccurrence(fall, fall.dueAt)).toBe(Date.parse('2026-11-01T14:00:00Z'));
  });

  it('restores the intended recurring wall-clock hour after a missing DST hour', () => {
    const beforeGap = reminder({
      dueAt: Date.parse('2026-03-07T07:30:00Z'),
      timeZone: 'America/New_York',
      recurrence: 'daily',
    });
    const first = claimDelivery(beforeGap, beforeGap.dueAt).reminder;
    expect(first.dueAt).toBe(Date.parse('2026-03-08T07:30:00Z'));
    expect(first.recurrenceTime).toBe('02:30:00');
    const second = claimDelivery(first, first.dueAt).reminder;
    expect(second.dueAt).toBe(Date.parse('2026-03-09T06:30:00Z'));
  });

  it('handles non-hour timezone offsets and weekly year boundaries', () => {
    const kathmandu = reminder({
      dueAt: Date.parse('2026-12-30T03:15:00Z'),
      timeZone: 'Asia/Kathmandu',
      recurrence: 'weekly',
    });
    expect(nextOccurrence(kathmandu, kathmandu.dueAt)).toBe(Date.parse('2027-01-06T03:15:00Z'));
  });

  it('resolves DST gaps forward and duplicated wall times to their earlier occurrence', () => {
    expect(parseLocalDateTime('2026-03-08T02:30', 'America/New_York')).toBe(
      Date.parse('2026-03-08T07:30:00Z'),
    );
    expect(parseLocalDateTime('2026-11-01T01:30', 'America/New_York')).toBe(
      Date.parse('2026-11-01T05:30:00Z'),
    );
  });

  it('rejects nonexistent calendar dates and unrecognized timezones', () => {
    expect(() => parseLocalDateTime('2026-02-30T10:00', 'UTC')).toThrow();
    expect(() => parseLocalDateTime('2026-02-28T25:00', 'UTC')).toThrow();
    expect(() => parseLocalDateTime('2026-02-28T10:00', 'Not/A_Zone')).toThrow();
  });
});

describe('settings migration and safe backup import', () => {
  it('returns independent defaults and migrates old flat settings', () => {
    const a = createDefaultData();
    const b = createDefaultData();
    a.settings.shortcuts.github = 'https://example.com/';
    expect(b.settings.shortcuts.github).toBe(DEFAULT_SETTINGS.shortcuts.github);
    expect(normalizeData({ skin: 'leafeon', size: 100 }).settings.skin).toBe('leafeon');
    expect(normalizeData({ skin: 'mint', size: 100 }).settings.skin).toBe('eevee');
    expect(normalizeData({ settings: { skin: 'lavender' } }).settings.skin).toBe('eevee');
    for (const skin of PET_SKINS)
      expect(normalizeData({ settings: { skin } }).settings.skin).toBe(skin);
    expect(normalizeData(undefined).reminders).toEqual([]);
  });

  it('clamps appearance and drops unsafe shortcuts and unknown fields', () => {
    const settings = normalizeSettings({
      size: -5,
      opacity: 9,
      lifecycle: 'exploded',
      quietHours: { start: '99:99', enabled: 'yes' },
      shortcuts: { work: 'https://example.com', unsafe: 'javascript:alert(1)' },
      token: 'never export',
    });
    expect(settings.size).toBe(48);
    expect(settings.opacity).toBe(1);
    expect(settings.lifecycle).toBe('running');
    expect(settings.quietHours).toEqual(DEFAULT_SETTINGS.quietHours);
    expect(settings.shortcuts).toEqual({ work: 'https://example.com/' });
    expect(settings).not.toHaveProperty('token');
  });

  it('drops invalid and duplicate entries when migrating damaged storage', () => {
    const result = normalizeData({
      settings: {},
      reminders: [reminder(), reminder(), { title: 'invalid' }],
      positions: { '1': { x: -100, y: Infinity } },
    });
    expect(result.reminders).toHaveLength(1);
    expect(result.positions['1']).toEqual({ x: 0, y: 0.8 });
    expect(isReminder(reminder({ timeZone: 'Broken/Zone' }))).toBe(false);
    expect(isReminder(reminder({ dueAt: NaN }))).toBe(false);
  });

  it('round-trips valid state and excludes unexpected credential fields', () => {
    const original = createDefaultData();
    original.reminders = [reminder()];
    const restored = validateImport(
      JSON.parse(JSON.stringify({ ...original, accessToken: 'secret' })),
    );
    expect(restored).toEqual(original);
    expect(restored).not.toHaveProperty('accessToken');
  });

  it('rejects unsafe imports instead of silently losing schedules', () => {
    const base = createDefaultData();
    expect(() =>
      validateImport({ ...base, reminders: [reminder({ url: 'javascript:alert(1)' })] }),
    ).toThrow(/invalid reminder/u);
    expect(() => validateImport({ ...base, reminders: [reminder(), reminder()] })).toThrow(
      /duplicate/u,
    );
    expect(() => validateImport({ ...base, settings: { ...base.settings, version: 99 } })).toThrow(
      /version/u,
    );
    expect(() =>
      validateImport({
        ...base,
        settings: { ...base.settings, shortcuts: { hacked: 'file:///private' } },
      }),
    ).toThrow(/unsafe/u);
    expect(() =>
      validateImport({ settings: { version: 1 }, oversized: 'x'.repeat(2_000_001) }),
    ).toThrow(/2 MB/u);
  });

  it('enforces the backup limit in UTF-8 bytes rather than character count', () => {
    expect(() => validateImport({ settings: { version: 1 }, text: '猫'.repeat(700_000) })).toThrow(
      /2 MB/u,
    );
  });

  it('evaluates overnight quiet hours and explicit lifecycle transitions', () => {
    const settings = createDefaultData().settings;
    settings.quietHours.enabled = true;
    expect(isQuietHours(settings, new Date(2026, 9, 25, 23, 0))).toBe(true);
    expect(isQuietHours(settings, new Date(2026, 9, 25, 7, 59))).toBe(true);
    expect(isQuietHours(settings, new Date(2026, 9, 25, 8, 0))).toBe(false);
    expect(transitionLifecycle('disabled', 'running')).toBe('running');
    expect(transitionLifecycle('running', 'paused')).toBe('paused');
  });
});

describe('abbreviated reminders and explicit link actions', () => {
  it.each([
    ['sec', 1000],
    ['secs', 1000],
    ['s', 1000],
    ['min', 60000],
    ['mins', 60000],
    ['m', 60000],
    ['hr', 3600000],
    ['hrs', 3600000],
    ['h', 3600000],
    ['d', 86400000],
    ['wk', 604800000],
    ['wks', 604800000],
  ])('accepts %s in both reminder orders and page reminders', (unit, factor) => {
    expect(parseCommand(`remind me in 10 ${unit} to check mail`, 1000)).toMatchObject({
      kind: 'reminder',
      title: 'check mail',
      dueAt: 1000 + 10 * Number(factor),
    });
    expect(parseCommand(`remind me to check mail in 10${unit}`, 1000)).toMatchObject({
      kind: 'reminder',
      title: 'check mail',
      dueAt: 1000 + 10 * Number(factor),
    });
    expect(parseCommand(`remind me about this page in 10${unit}`, 1000)).toMatchObject({
      kind: 'page-reminder',
      dueAt: 1000 + 10 * Number(factor),
    });
  });
  it('recognizes the reported check-mail phrase without inferring a destination', () => {
    const intent = parseCommand('remind me in 10 min to check mail', 1000);
    expect(intent).toMatchObject({ kind: 'reminder', title: 'check mail', dueAt: 601000 });
    expect(intent).not.toHaveProperty('url');
    expect(intent).not.toHaveProperty('openUrlOnDue');
  });
  it.each([
    ['remind me in 20m to check (https://example.com/?q=why?)', 'https://example.com/?q=why?'],
    [
      'remind me in 20m to check https://example.com/?next=https://other.example/a',
      'https://example.com/?next=https://other.example/a',
    ],
    [
      'remind me in 20 min to check https://example.com/path_(one)',
      'https://example.com/path_(one)',
    ],
    [
      'remind me in 20 min to check(https://example.com/path_(one)).',
      'https://example.com/path_(one)',
    ],
    [
      'remind me to check https://example.com/?q=a&next=b in 20 mins',
      'https://example.com/?q=a&next=b',
    ],
  ])('retains a single literal safe link: %s', (command, url) => {
    expect(parseCommand(command, 1000)).toMatchObject({
      kind: 'reminder',
      url,
      openUrlOnDue: true,
      dueAt: 1201000,
    });
  });
  it.each([
    'javascript:alert(1)',
    'mailto:person@example.com',
    'data:text/html,x',
    'file:///secret',
    'ftp://example.com/file',
    'https: //example.com',
    'https://user:secret@example.com',
    'https://example.com\\@other.example',
    'https://example.com/ https://other.example/',
  ])('clarifies unsafe or multiple URLs: %s', (url) =>
    expect(parseCommand(`remind me in 20m to check ${url}`, 1000).kind).toBe('clarify'),
  );
  it('persists opt-in only on local reminders with a validated URL, and strips it from imports', () => {
    const value = {
      ...reminder(),
      source: 'local' as const,
      url: 'https://example.com/',
      openUrlOnDue: true,
    };
    expect(isReminder(value)).toBe(true);
    expect(normalizeData({ reminders: [value] }).reminders[0]?.openUrlOnDue).toBe(true);
    expect(isReminder({ ...value, source: 'calendar' })).toBe(false);
    expect(isReminder({ ...value, url: 'javascript:alert(1)' })).toBe(false);
    const restored = validateImport({
      settings: DEFAULT_SETTINGS,
      reminders: [value],
      catchUp: [value],
    });
    expect(restored.reminders[0]?.url).toBe(value.url);
    expect(restored.reminders[0]?.openUrlOnDue).not.toBe(true);
    expect(restored.catchUp[0]?.openUrlOnDue).not.toBe(true);
  });
});
