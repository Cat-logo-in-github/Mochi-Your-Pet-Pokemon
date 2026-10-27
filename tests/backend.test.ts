import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultData, newReminder } from '@mochi/shared';
import {
  canSend,
  isMessage,
  isTrustedSender,
  responseForSender,
} from '../apps/extension/src/protocol';
import {
  deliverDue,
  openReminderUrl,
  pendingReminderNotices,
  deliveryLedger,
  writeLedger,
  nextReminderTime,
  rebuildAlarms,
  SWEEP_ALARM,
  DUE_ALARM,
  GOOGLE_ALARM,
} from '../apps/extension/src/scheduler';
import {
  apiJson,
  disconnectGoogle,
  getGoogleToken,
  gmailChanges,
  googleDefaults,
  readGoogle,
  writeGoogle,
  publicGoogle,
  normalizeGoogleConfig,
  paginated,
  SCOPES,
  syncCalendar,
  syncGoogleService,
  syncGmail,
  trustedCalendarUrl,
} from '../apps/extension/src/google';
import { serial } from '../apps/extension/src/storage';
let store: Record<string, unknown>;
let alarms: Map<string, unknown>;
function mockChrome() {
  store = {};
  alarms = new Map();
  const local = {
    setAccessLevel: vi.fn(async () => undefined),
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(store, structuredClone(patch));
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const key of keys) delete store[key];
    }),
  };
  const chromeMock = {
    runtime: {
      onMessage: { addListener: vi.fn() },
      openOptionsPage: vi.fn(async () => undefined),
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      id: 'test-extension',
      getManifest: vi.fn(() => ({ oauth2: { client_id: 'public.apps.googleusercontent.com' } })),
      getURL: (file: string) => `chrome-extension://test-extension/${file}`,
    },
    storage: { local },
    tabs: {
      query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []),
      sendMessage: vi.fn(async () => undefined),
      create: vi.fn(async () => ({ id: 99 }) as chrome.tabs.Tab),
    },
    alarms: {
      onAlarm: { addListener: vi.fn() },
      get: vi.fn(async (name: string) => alarms.get(name)),
      getAll: vi.fn(async () => [...alarms.keys()].map((name) => ({ name }))),
      create: vi.fn(async (name: string, data: unknown) => {
        alarms.set(name, data);
      }),
      clear: vi.fn(async (name: string) => alarms.delete(name)),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    commands: { onCommand: { addListener: vi.fn() } },
    notifications: {
      onClicked: { addListener: vi.fn() },
      onButtonClicked: { addListener: vi.fn() },
      create: vi.fn(async () => 'notification'),
      clear: vi.fn(async () => true),
    },
    permissions: { contains: vi.fn(async () => true) },
    identity: {
      getAuthToken: vi.fn(async () => ({
        token: 'mock-private-token',
        grantedScopes: Object.values(SCOPES),
      })),
      removeCachedAuthToken: vi.fn(async () => undefined),
    },
  };
  vi.stubGlobal('chrome', chromeMock);
  return chromeMock;
}
let chromeMock: ReturnType<typeof mockChrome>;
beforeEach(() => {
  vi.restoreAllMocks();
  chromeMock = mockChrome();
  vi.stubGlobal('fetch', vi.fn());
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('extension privilege boundary', () => {
  it('rejects malformed commands and unbounded positions', () => {
    for (const message of [
      null,
      {},
      { type: 'unknown' },
      { type: 'command', text: 'x'.repeat(1001) },
      { type: 'position', x: NaN, y: 0 },
      { type: 'position', x: 1.1, y: 0 },
      { type: 'reminder-action', id: 'x', action: 'snooze', minutes: -1 },
    ])
      expect(isMessage(message)).toBe(false);
    expect(isMessage({ type: 'command', text: 'open GitHub' })).toBe(true);
  });
  it('rejects external webpage senders and subframes', () => {
    expect(
      isTrustedSender(
        { id: 'other', url: 'https://example.com', tab: { id: 1 } } as chrome.runtime.MessageSender,
        'test-extension',
      ),
    ).toBe(false);
    expect(
      isTrustedSender(
        {
          id: 'test-extension',
          url: 'https://example.com',
          tab: { id: 1 },
          frameId: 1,
        } as chrome.runtime.MessageSender,
        'test-extension',
      ),
    ).toBe(false);
  });
  it('limits account connection and imports to extension UI', () => {
    const content = {
      id: 'test-extension',
      url: 'https://example.com',
      tab: { id: 1 },
      frameId: 0,
    } as chrome.runtime.MessageSender;
    const settings = {
      id: 'test-extension',
      url: 'chrome-extension://test-extension/options.html',
    };
    expect(canSend({ type: 'command', text: 'help' }, content, 'test-extension')).toBe(true);
    expect(canSend({ type: 'reset' }, content, 'test-extension')).toBe(false);
    expect(
      canSend({ type: 'google', service: 'gmail', action: 'connect' }, content, 'test-extension'),
    ).toBe(false);
    expect(canSend({ type: 'reset' }, settings, 'test-extension')).toBe(true);
  });
});
describe('durable reminder alarms', () => {
  it('recreates missing alarms and bounds far future dates', async () => {
    const data = createDefaultData();
    data.reminders = [newReminder('Future', Date.now() + 100 * 86400000, 'UTC')];
    await rebuildAlarms(data);
    expect(alarms.has(SWEEP_ALARM)).toBe(true);
    expect(alarms.has(DUE_ALARM)).toBe(true);
    expect(nextReminderTime(data)! - Date.now()).toBeLessThanOrEqual(86400000);
  });
  it('shuts down only Mochi alarms and preserves reminder definitions', async () => {
    const data = createDefaultData();
    data.settings.lifecycle = 'disabled';
    data.reminders = [newReminder('Keep me', Date.now() + 100000, 'UTC')];
    alarms.set('mochi:due', {});
    alarms.set('another-feature', {});
    await rebuildAlarms(data, true);
    expect([...alarms.keys()]).toEqual(['another-feature']);
    expect(data.reminders).toHaveLength(1);
  });
  it('deduplicates repeated delivery and worker restarts', async () => {
    const data = createDefaultData();
    data.reminders = [newReminder('Join meeting', Date.now() - 1000, 'UTC')];
    await deliverDue(data);
    await deliverDue(structuredClone(data));
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(data.reminders[0]?.completed).toBe(true);
    const notification = chromeMock.notifications.create.mock.calls[0];
    expect(notification).toBeTruthy();
  });
  it('keeps a durable claim when the OS notification call fails', async () => {
    chromeMock.notifications.create.mockRejectedValueOnce(new Error('OS unavailable'));
    const data = createDefaultData();
    data.reminders = [newReminder('Only once', Date.now() - 1000, 'UTC')];
    await deliverDue(data);
    await deliverDue(data);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(data.diagnostics).toHaveLength(1);
    expect(Object.keys(store['mochi-deliveries'] as object)).toHaveLength(1);
  });
  it('defers notification delivery during quiet hours', async () => {
    const data = createDefaultData();
    data.settings.quietHours = { enabled: true, start: '00:00', end: '00:00' };
    data.reminders = [newReminder('Quiet', Date.now() - 1000, 'UTC')];
    await deliverDue(data);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(data.reminders[0]?.completed).toBe(false);
  });
  it('preserves enabled local reminders while paused and stops optional Google polling', async () => {
    const data = createDefaultData();
    data.settings.lifecycle = 'paused';
    data.reminders = [newReminder('Still notify', Date.now() - 1000, 'UTC')];
    alarms.set('mochi:google', {});
    await deliverDue(data);
    await rebuildAlarms(data, true);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(alarms.has('mochi:google')).toBe(false);
  });
  it('serializes mutations even when a previous request fails', async () => {
    const calls: string[] = [];
    const first = serial(async () => {
      calls.push('first');
      throw new Error('expected');
    }).catch(() => undefined);
    const second = serial(async () => {
      calls.push('second');
      return 2;
    });
    await first;
    expect(await second).toBe(2);
    expect(calls).toEqual(['first', 'second']);
  });
});
describe('Google optional configuration and safety', () => {
  it('does not begin OAuth without public build-time configuration', async () => {
    chromeMock.runtime.getManifest.mockReturnValueOnce({} as never);
    await expect(getGoogleToken('calendar', true)).rejects.toThrow('public build');
    expect(chromeMock.identity.getAuthToken).not.toHaveBeenCalled();
  });
  it('requires separately granted API host permission', async () => {
    chromeMock.permissions.contains.mockResolvedValueOnce(false);
    await expect(getGoogleToken('gmail', true)).rejects.toThrow('Connect button');
    expect(chromeMock.identity.getAuthToken).not.toHaveBeenCalled();
  });
  it('requests only the selected service scope and never writes tokens to local storage', async () => {
    expect(await getGoogleToken('gmail', true)).toBe('mock-private-token');
    expect(chromeMock.identity.getAuthToken).toHaveBeenCalledWith({
      interactive: true,
      scopes: [SCOPES.gmail],
      enableGranularPermissions: true,
    });
    expect(JSON.stringify(store)).not.toContain('mock-private-token');
  });
  it('rejects untrusted API hosts before sending authorization', async () => {
    await expect(
      apiJson('mock-private-token', 'https://gmail.googleapis.com.evil.example/'),
    ).rejects.toThrow('untrusted');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('clears a revoked token without logging server bodies or tokens', async () => {
    const log = vi.spyOn(console, 'log');
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ error: 'mock-private-token provider body' }, 401),
    );
    await expect(
      apiJson('mock-private-token', 'https://gmail.googleapis.com/gmail/v1/users/me/profile'),
    ).rejects.toThrow('revoked');
    expect(chromeMock.identity.removeCachedAuthToken).toHaveBeenCalledWith({
      token: 'mock-private-token',
    });
    expect(log).not.toHaveBeenCalled();
  });
  it('paginates and refuses repeated cursors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ items: [1], nextPageToken: 'second' }))
      .mockResolvedValueOnce(json({ items: [2] }));
    const result = await paginated<number>(
      'mock-private-token',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      'items',
    );
    expect(result.items).toEqual([1, 2]);
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain('pageToken=second');
    vi.mocked(fetch).mockImplementation(async () => json({ items: [], nextPageToken: 'same' }));
    await expect(
      paginated(
        'mock-private-token',
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        'items',
      ),
    ).rejects.toThrow('repeated page');
  });
  it('backs off quota errors with no tokens in diagnostics', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: 'mock-private-token' }, 429));
    const state = googleDefaults();
    state.gmail.connected = true;
    state.historyId = '123';
    const data = createDefaultData();
    await syncGoogleService(state, data, 'gmail');
    expect(state.gmail.retryAt).toBeGreaterThan(Date.now() + 290000);
    expect(state.gmail.error).toContain('quota');
    expect(JSON.stringify({ store, data })).not.toContain('mock-private-token');
  });
  it('falls back to an inbox baseline when a Gmail history cursor expires', async () => {
    const state = googleDefaults();
    state.historyId = 'expired';
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ historyId: 'new' }))
      .mockResolvedValueOnce(json({ messages: [{ id: 'a' }], nextPageToken: 'more' }))
      .mockResolvedValueOnce(json({ messages: [{ id: 'b' }] }));
    const result = await gmailChanges(state, 'mock-private-token');
    expect(result).toEqual({ ids: ['a', 'b'], cursor: 'new', baseline: true });
    expect(
      vi.mocked(fetch).mock.calls.every((call) => !String(call[0]).includes('format=full')),
    ).toBe(true);
  });
  it('removes cancelled and moved calendar reminders while preserving delivery state for unchanged occurrences', async () => {
    const now = Date.now(),
      start = now + 3600000;
    const data = createDefaultData();
    const state = googleDefaults();
    const event = {
      id: 'a',
      summary: 'Meeting',
      start: { dateTime: new Date(start).toISOString() },
      end: { dateTime: new Date(start + 3600000).toISOString() },
      htmlLink: 'https://calendar.google.com/event?eid=a',
    };
    vi.mocked(fetch).mockResolvedValueOnce(json({ items: [event], timeZone: 'UTC' }));
    await syncCalendar(state, data, 'mock-private-token', now);
    const reminder = data.reminders[0]!;
    reminder.completed = true;
    reminder.lastDeliveredAt = reminder.dueAt;
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ items: [{ ...event, summary: 'Renamed' }], timeZone: 'UTC' }),
    );
    await syncCalendar(state, data, 'mock-private-token', now);
    expect(data.reminders[0]?.title).toBe('Calendar event');
    expect(data.reminders[0]?.completed).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(
      json({ items: [{ ...event, status: 'cancelled' }], timeZone: 'UTC' }),
    );
    await syncCalendar(state, data, 'mock-private-token', now);
    expect(data.reminders).toHaveLength(0);
    expect(state.calendar.items).toHaveLength(0);
  });
  it('cleans only the disconnected service data', async () => {
    const state = googleDefaults();
    state.gmail.connected = true;
    state.calendar.connected = true;
    state.historyId = '123';
    state.seen = ['a'];
    const data = createDefaultData();
    data.reminders = [{ ...newReminder('Event', Date.now() + 60000, 'UTC'), source: 'calendar' }];
    await disconnectGoogle(state, data, 'gmail');
    expect(state.gmail.connected).toBe(false);
    expect(state.seen).toEqual([]);
    expect(state.historyId).toBeUndefined();
    expect(state.calendar.connected).toBe(true);
    expect(data.reminders).toHaveLength(1);
  });
  it('validates calendar click destinations and preference budgets', () => {
    expect(trustedCalendarUrl('https://www.google.com/url?q=https://evil.example')).toBe(
      'https://calendar.google.com/',
    );
    expect(trustedCalendarUrl('https://calendar.google.com.evil.example/')).toBe(
      'https://calendar.google.com/',
    );
    const config = normalizeGoogleConfig({
      offsetMinutes: 999,
      calendarIds: [],
      gmailSenders: ['A@EXAMPLE.COM'],
    });
    expect(config.offsetMinutes).toBe(10);
    expect(config.calendarIds).toEqual(['primary']);
    expect(config.gmailSenders).toEqual(['a@example.com']);
  });
});

describe('bounded Gmail worker batches', () => {
  it('persists remaining metadata IDs and advances the history cursor only after completion', async () => {
    const state = googleDefaults();
    state.gmail.connected = true;
    state.gmail.lastSync = Date.now() - 60000;
    state.historyId = 'before';
    state.pending = {
      ids: Array.from({ length: 55 }, (_, i) => `email-${i}`),
      cursor: 'after',
      baseline: false,
      since: state.gmail.lastSync,
    };
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/labels/')
        ? json({ messagesUnread: 55 })
        : json({
            labelIds: ['INBOX', 'IMPORTANT'],
            internalDate: String(Date.now()),
            payload: {
              headers: [
                { name: 'From', value: 'Alex <alex@example.com>' },
                { name: 'Subject', value: 'A useful subject' },
              ],
            },
          }),
    );
    const data = createDefaultData();
    await syncGmail(state, data, 'mock-private-token');
    expect(state.pending?.ids).toHaveLength(5);
    expect(state.historyId).toBe('before');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(50);
    await syncGmail(state, data, 'mock-private-token');
    expect(state.pending).toBeUndefined();
    expect(state.historyId).toBe('after');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(55);
    expect(
      vi.mocked(fetch).mock.calls.every((call) => !String(call[0]).includes('format=full')),
    ).toBe(true);
    expect(JSON.stringify(store)).not.toContain('mock-private-token');
    expect(JSON.stringify(store)).not.toContain('A useful subject');
  });
  it('establishes a silent inbox baseline without requesting headers', async () => {
    const state = googleDefaults();
    state.pending = { ids: ['old-a', 'old-b'], cursor: 'start', baseline: true, since: Date.now() };
    vi.mocked(fetch).mockResolvedValueOnce(json({ messagesUnread: 2 }));
    await syncGmail(state, createDefaultData(), 'mock-private-token');
    expect(state.historyId).toBe('start');
    expect(state.seen).toEqual(['old-a', 'old-b']);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps Google account preferences out of content-script responses', () => {
    const state = googleDefaults();
    state.config.gmailSenders = ['private@example.com'];
    const result = responseForSender(
      { ok: true, data: createDefaultData(), google: state },
      {
        id: 'test-extension',
        url: 'https://example.com',
        tab: { id: 1 },
        frameId: 0,
      } as chrome.runtime.MessageSender,
      'test-extension',
    );
    expect(result.ok && result.google.config.gmailSenders).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('private@example.com');
  });
});

describe('reminder action routing', () => {
  async function router() {
    const mod = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    return mod.executeMessage;
  }
  const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' };
  it('snoozes an upcoming one-time occurrence without leaving the original pending', async () => {
    const execute = await router();
    const data = createDefaultData();
    data.reminders = [newReminder('Move me', Date.now() + 86400000, 'UTC')];
    store.mochi = data;
    const result = await execute(
      { type: 'reminder-action', id: data.reminders[0]!.id, action: 'snooze', minutes: 10 },
      sender,
    );
    expect(result.ok && result.data.reminders.filter((r) => !r.completed)).toHaveLength(1);
    expect(result.ok && result.data.reminders[0]?.completed).toBe(true);
  });
  it('keeps the next recurring occurrence when snoozing an OS notification', async () => {
    const execute = await router();
    const data = createDefaultData();
    const next = Date.now() + 86400000;
    data.reminders = [
      {
        ...newReminder('Daily', next, 'UTC'),
        recurrence: 'daily',
        lastDeliveredAt: next - 86400000,
      },
    ];
    store.mochi = data;
    const result = await execute(
      { type: 'reminder-action', id: data.reminders[0]!.id, action: 'snooze', minutes: 5 },
      sender,
      true,
    );
    expect(result.ok && result.data.reminders[0]?.dueAt).toBe(next);
    expect(result.ok && result.data.reminders[0]?.lastDeliveredAt).toBe(next - 86400000);
  });
  it('dismisses a catch-up card without skipping the next recurring occurrence', async () => {
    const execute = await router();
    const data = createDefaultData();
    const next = Date.now() + 86400000;
    const reminder = {
      ...newReminder('Daily', next, 'UTC'),
      recurrence: 'daily' as const,
      lastDeliveredAt: next - 86400000,
    };
    data.reminders = [reminder];
    data.catchUp = [{ ...reminder, dueAt: next - 86400000 }];
    store.mochi = data;
    const result = await execute(
      { type: 'reminder-action', id: reminder.id, action: 'dismiss' },
      sender,
    );
    expect(result.ok && result.data.reminders[0]?.dueAt).toBe(next);
    expect(result.ok && result.data.catchUp).toEqual([]);
  });
  it('stores a muted occurrence when a generated Calendar reminder is deleted', async () => {
    const execute = await router();
    const data = createDefaultData();
    data.reminders = [
      {
        ...newReminder('Calendar', Date.now() + 60000, 'UTC'),
        id: 'calendar-abc',
        source: 'calendar',
      },
    ];
    store.mochi = data;
    await execute({ type: 'reminder-delete', id: 'calendar-abc' }, sender);
    expect((store['mochi-google'] as { mutedEventIds: string[] }).mutedEventIds).toEqual([
      'calendar-abc',
    ]);
  });
});

describe('read-only snapshots and stable due alarms', () => {
  it('retains an existing earlier alarm when rebuilding', async () => {
    const now = Date.now();
    const data = createDefaultData();
    data.reminders = [newReminder('Soon', now + 5000, 'UTC')];
    alarms.set(DUE_ALARM, { scheduledTime: now + 15000 });
    await rebuildAlarms(data);
    expect(chromeMock.alarms.create.mock.calls.some((call) => call[0] === DUE_ALARM)).toBe(false);
  });
  it('does not write storage or reschedule alarms when the popup reads state', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    chromeMock.storage.local.set.mockClear();
    chromeMock.alarms.create.mockClear();
    const result = await executeMessage(
      { type: 'get' },
      { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' },
    );
    expect(result.ok).toBe(true);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });
});

describe('idle maintenance budget', () => {
  it('does not create a maintenance alarm when there are no pending reminders or connections', async () => {
    await rebuildAlarms(createDefaultData());
    expect(chromeMock.alarms.create).not.toHaveBeenCalled();
  });
});

describe('summoning the actual roaming pet', () => {
  it.each([{ type: 'summon' as const }, { type: 'command' as const, text: 'come here' }])(
    'wakes Mochi and recalls it to the active tab for %j',
    async (message) => {
      const { executeMessage } = await import('../apps/extension/src/background');
      await serial(async () => undefined);
      const data = createDefaultData();
      data.settings.lifecycle = 'hidden';
      store.mochi = data;
      chromeMock.tabs.query.mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);
      const result = await executeMessage(message, {
        id: 'test-extension',
        url: 'chrome-extension://test-extension/popup.html',
      });
      expect(isMessage({ type: 'summon' })).toBe(true);
      expect(result.ok && result.data.settings.lifecycle).toBe('running');
      expect(chromeMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(42, { type: 'mochi-summon' });
      expect(result.ok && result.message).toContain('Here I am');
    },
  );
});

describe('persistent readable reminder delivery', () => {
  it('keeps the full unread reminder even when the OS refuses notifications', async () => {
    chromeMock.notifications.create.mockRejectedValueOnce(new Error('OS blocked'));
    const data = createDefaultData();
    data.reminders = [newReminder('Readable title with a link', Date.now() - 1000, 'UTC')];
    data.reminders[0].url = 'https://example.com/article';
    await deliverDue(data);
    const notices = await pendingReminderNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('Readable title with a link');
    expect(notices[0].url).toBe('https://example.com/article');
    await deliverDue(data);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('recovers a saved but not yet notified occurrence after worker restart', async () => {
    const reminder = newReminder('Recovered event', Date.now() - 1000, 'UTC');
    const id = `mochi:r:${reminder.id}:${reminder.dueAt}`;
    await writeLedger({
      [id]: {
        reminderId: reminder.id,
        dueAt: reminder.dueAt,
        expiresAt: Date.now() + 86400000,
        reminder,
      },
    });
    await deliverDue(createDefaultData());
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect((await deliveryLedger())[id].notificationAttemptedAt).toBeGreaterThan(0);
  });
  it('does not surface acknowledged or expired occurrences in the inbox', async () => {
    const reminder = newReminder('Done', Date.now(), 'UTC');
    await writeLedger({
      acknowledged: {
        reminder,
        dueAt: reminder.dueAt,
        expiresAt: Date.now() + 86400000,
        acknowledgedAt: Date.now(),
      },
      expired: { reminder, dueAt: reminder.dueAt, expiresAt: Date.now() - 1 },
    });
    expect(await pendingReminderNotices()).toEqual([]);
  });
});

describe('linked reminders and occurrence acknowledgements', () => {
  const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' };
  it('dismisses a past occurrence without skipping the next scheduled repeat', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    const past = newReminder('Daily event', Date.now() - 1000, 'UTC');
    past.recurrence = 'daily';
    const future = { ...past, dueAt: Date.now() + 86400000 };
    const data = createDefaultData();
    data.reminders = [future];
    store.mochi = data;
    const deliveryId = `mochi:r:${past.id}:${past.dueAt}`;
    await writeLedger({
      [deliveryId]: {
        reminderId: past.id,
        dueAt: past.dueAt,
        expiresAt: Date.now() + 86400000,
        reminder: past,
        notificationAttemptedAt: Date.now(),
      },
    });
    const result = await executeMessage(
      { type: 'reminder-action', id: past.id, deliveryId, action: 'dismiss' },
      sender,
    );
    expect(result.ok && result.data.reminders[0].dueAt).toBe(future.dueAt);
    expect(await pendingReminderNotices()).toEqual([]);
  });
  it('keeps the current page link in an explicitly requested reminder', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    store.mochi = createDefaultData();
    const result = await executeMessage(
      { type: 'command', text: 'remind me about this page in 30 minutes' },
      {
        id: 'test-extension',
        url: 'https://example.com/article',
        frameId: 0,
        tab: { id: 1, title: 'A useful article', url: 'https://example.com/article' },
      } as chrome.runtime.MessageSender,
    );
    expect(result.ok && result.data.reminders[0].url).toBe('https://example.com/article');
    expect(result.ok && result.data.reminders[0].title).toBe('Revisit: A useful article');
  });
});

describe('explicit scheduled local URL actions', () => {
  function linked(title = 'Open article') {
    return {
      ...newReminder(title, Date.now() - 1000, 'UTC'),
      url: 'https://example.com/article?q=one',
      openUrlOnDue: true,
    };
  }
  it('persists the action claim before opening and never reopens after a worker restart', async () => {
    const data = createDefaultData();
    data.reminders = [linked()];
    chromeMock.tabs.create.mockImplementation(async () => {
      const delivery = Object.values(
        store['mochi-deliveries'] as Record<string, { urlOpenAttemptedAt?: number }>,
      )[0]!;
      expect(delivery.urlOpenAttemptedAt).toBeGreaterThan(0);
      return { id: 99 } as chrome.tabs.Tab;
    });
    await deliverDue(data);
    expect(chromeMock.tabs.create).toHaveBeenCalledExactlyOnceWith({
      url: 'https://example.com/article?q=one',
      active: true,
    });
    await deliverDue(structuredClone(store.mochi) as ReturnType<typeof createDefaultData>);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect((await pendingReminderNotices())[0]?.urlOpenStatus).toBe('opened');
  });
  it('never opens if its durable claim cannot be saved', async () => {
    const reminder = linked();
    const ledger = {};
    chromeMock.storage.local.set.mockRejectedValueOnce(new Error('Quota exceeded'));
    await expect(openReminderUrl(reminder, ledger)).rejects.toThrow('Quota');
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    await openReminderUrl(reminder, ledger);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('opens an opted-in link even when OS notifications are blocked', async () => {
    chromeMock.notifications.create.mockRejectedValue(new Error('blocked'));
    const data = createDefaultData();
    data.reminders = [linked()];
    await deliverDue(data);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(await pendingReminderNotices()).toHaveLength(1);
    await deliverDue(data);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('recovers a queued unclaimed URL action independently of an earlier notification attempt', async () => {
    const reminder = linked();
    const id = `mochi:r:${reminder.id}:${reminder.dueAt}`;
    await writeLedger({
      [id]: {
        reminder,
        reminderId: reminder.id,
        dueAt: reminder.dueAt,
        expiresAt: Date.now() + 86400000,
        notificationAttemptedAt: Date.now(),
      },
    });
    await deliverDue(createDefaultData());
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    await deliverDue(createDefaultData());
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('does not replay an action whose durable claim already exists', async () => {
    const reminder = linked();
    const id = `mochi:r:${reminder.id}:${reminder.dueAt}`;
    await writeLedger({
      [id]: {
        reminder,
        reminderId: reminder.id,
        dueAt: reminder.dueAt,
        expiresAt: Date.now() + 86400000,
        urlOpenAttemptedAt: Date.now(),
      },
    });
    await deliverDue(createDefaultData());
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('keeps manual and Calendar links manual and respects quiet hours', async () => {
    const data = createDefaultData();
    data.reminders = [
      { ...linked('Manual'), openUrlOnDue: false },
      { ...linked('Calendar'), source: 'calendar', openUrlOnDue: false },
    ];
    await deliverDue(data);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    const quiet = createDefaultData();
    quiet.settings.quietHours = { enabled: true, start: '00:00', end: '00:00' };
    quiet.reminders = [linked()];
    await deliverDue(quiet);
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    quiet.settings.quietHours.enabled = false;
    await deliverDue(quiet);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('preserves a snoozed link while disabling automatic opening for the new occurrence', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    const data = createDefaultData();
    const reminder = linked();
    data.reminders = [reminder];
    store.mochi = data;
    await deliverDue(data);
    const result = await executeMessage(
      {
        type: 'reminder-action',
        id: reminder.id,
        deliveryId: `mochi:r:${reminder.id}:${reminder.dueAt}`,
        action: 'snooze',
        minutes: 5,
      },
      { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' },
    );
    if (!result.ok) throw new Error(result.error);
    const snooze = result.data.reminders.find((r) => r.id !== reminder.id)!;
    expect(snooze.url).toBe(reminder.url);
    expect(snooze.openUrlOnDue).toBe(false);
    expect(result.message).toContain('automatic opening is off');
    await deliverDue(result.data, snooze.dueAt + 1);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('reports a refused tab opening and does not retry its claimed side effect', async () => {
    chromeMock.tabs.create.mockRejectedValue(new Error('Browser refused'));
    const data = createDefaultData();
    data.reminders = [linked()];
    await deliverDue(data);
    expect((await pendingReminderNotices())[0]?.urlOpenStatus).toBe('blocked');
    await deliverDue(data);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('saves abbreviated link commands with a clear opening confirmation', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    store.mochi = createDefaultData();
    const valid = await executeMessage(
      { type: 'command', text: 'remind me in 20min to check (https://example.com)' },
      { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' },
    );
    if (!valid.ok) throw new Error(valid.error);
    expect(valid.data.reminders[0]).toMatchObject({
      url: 'https://example.com/',
      openUrlOnDue: true,
      source: 'local',
    });
    expect(valid.message).toContain('I’ll open example.com');
  });
});

describe('Google monitoring privacy and important-mail policy', () => {
  function arriving(labels: string[], from = 'Private Name <important@example.invalid>') {
    const state = googleDefaults();
    state.gmail.connected = true;
    state.gmail.lastSync = Date.now() - 60000;
    state.pending = {
      ids: ['arrival'],
      cursor: 'next-cursor',
      baseline: false,
      since: state.gmail.lastSync,
    };
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/labels/')
        ? json({ messagesUnread: 3 })
        : json({
            labelIds: labels,
            internalDate: String(Date.now()),
            payload: {
              headers: [
                { name: 'From', value: from },
                { name: 'Subject', value: 'PRIVATE_SUBJECT' },
              ],
            },
          }),
    );
    return state;
  }
  it('keeps an explicitly selected important filter while new defaults allow all inbox mail', async () => {
    const state = arriving(['INBOX']);
    state.config.gmailMode = 'important';
    await syncGmail(state, createDefaultData(), 'mock-private-token');
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(state.gmail.unread).toBe(3);
    expect(normalizeGoogleConfig({}).gmailMode).toBe('all');
    expect(
      vi.mocked(fetch).mock.calls.every((call) => !String(call[0]).includes('metadataHeaders')),
    ).toBe(true);
  });
  it('notifies IMPORTANT messages generically without fetching subjects or headers', async () => {
    const state = arriving(['INBOX', 'IMPORTANT']);
    await syncGmail(state, createDefaultData(), 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(chromeMock.notifications.create.mock.calls);
    expect(payload).not.toContain('PRIVATE_SUBJECT');
    expect(payload).not.toContain('Private Name');
    expect(payload).not.toContain('important@example.invalid');
    expect(JSON.stringify(store)).not.toContain('PRIVATE_SUBJECT');
    expect(
      vi.mocked(fetch).mock.calls.every((call) => !String(call[0]).includes('metadataHeaders')),
    ).toBe(true);
  });
  it('matches exact important sender addresses transiently, requesting From only', async () => {
    const state = arriving(['INBOX']);
    state.config.gmailMode = 'important';
    state.config.gmailSenders = ['important@example.invalid'];
    await syncGmail(state, createDefaultData(), 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    const requests = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(requests.some((url) => url.includes('metadataHeaders=From'))).toBe(true);
    expect(requests.some((url) => url.includes('Subject'))).toBe(false);
    expect(JSON.stringify(store)).not.toContain('Private Name');
    expect(JSON.stringify(store)).not.toContain('PRIVATE_SUBJECT');
    chromeMock.notifications.create.mockClear();
    const other = arriving(['INBOX'], 'Other <important@example.invalid.attacker>');
    other.config.gmailMode = 'important';
    other.config.gmailSenders = ['important@example.invalid'];
    store['mochi-deliveries'] = {};
    await syncGmail(other, createDefaultData(), 'mock-private-token');
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
  });
  it('requires the explicit All mode before notifying unimportant mail', async () => {
    const state = arriving(['INBOX']);
    state.config.gmailMode = 'all';
    await syncGmail(state, createDefaultData(), 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('drops unknown account fields and private legacy Calendar text from cache/status', async () => {
    store['mochi-google'] = {
      ...googleDefaults(),
      token: 'PRIVATE_TOKEN',
      accountName: 'PRIVATE_ACCOUNT',
      calendar: {
        connected: true,
        error: 'PRIVATE_ERROR private@example.invalid',
        items: [
          {
            id: 'opaque',
            title: 'PRIVATE_EVENT',
            start: Date.now(),
            end: Date.now() + 60000,
            url: 'https://calendar.google.com/event?eid=PRIVATE_ID',
            calendarId: 'private@example.invalid',
            eventType: 'default',
          },
        ],
      },
    };
    const state = await readGoogle();
    await writeGoogle(state);
    const safe = JSON.stringify({
      state,
      public: publicGoogle(state),
      stored: store['mochi-google'],
    });
    for (const secret of [
      'PRIVATE_TOKEN',
      'PRIVATE_ACCOUNT',
      'PRIVATE_ERROR',
      'PRIVATE_EVENT',
      'PRIVATE_ID',
      'private@example.invalid',
    ])
      expect(safe).not.toContain(secret);
    expect(state.calendar.items[0]?.title).toBe('Calendar event');
  });
  it('fetches only event scheduling fields and persists generic reminders', async () => {
    const state = googleDefaults(),
      data = createDefaultData(),
      start = Date.now() + 3600000;
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        items: [
          {
            id: 'PRIVATE_PROVIDER_EVENT',
            summary: 'PRIVATE_EVENT_TITLE',
            htmlLink: 'https://calendar.google.com/event?eid=PRIVATE_EVENT',
            start: { dateTime: new Date(start).toISOString() },
            end: { dateTime: new Date(start + 60000).toISOString() },
          },
        ],
        timeZone: 'UTC',
      }),
    );
    await syncCalendar(state, data, 'mock-private-token');
    await writeGoogle(state);
    const fields = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0])).searchParams.get('fields');
    expect(fields).not.toContain('summary');
    expect(fields).not.toContain('htmlLink');
    expect(JSON.stringify({ state, data, store })).not.toContain('PRIVATE_EVENT_TITLE');
    expect(JSON.stringify({ state, data, store })).not.toContain('PRIVATE_PROVIDER_EVENT');
    expect(data.reminders[0]?.title).toBe('Calendar event');
  });
  it('requires extension-owned review before opening a workflow and never persists draft text', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    store.mochi = createDefaultData();
    const text = 'draft email to reader@example.invalid subject PRIVATE_DRAFT';
    await executeMessage(
      { type: 'command', text },
      { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' },
    );
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
    expect(
      canSend(
        { type: 'google-workflow-open', text },
        {
          id: 'test-extension',
          url: 'https://example.com',
          tab: { id: 1 },
          frameId: 0,
        } as chrome.runtime.MessageSender,
        'test-extension',
      ),
    ).toBe(false);
    const result = await executeMessage(
      { type: 'google-workflow-open', text },
      { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' },
    );
    expect(result.ok).toBe(true);
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(store)).not.toContain('PRIVATE_DRAFT');
    expect(JSON.stringify(store)).not.toContain('reader@example.invalid');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('browser pet full settings routing', () => {
  it('opens the full extension options page from a trusted content command', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    const sender = {
      id: 'test-extension',
      url: 'https://example.com/',
      tab: { id: 1 },
      frameId: 0,
    } as chrome.runtime.MessageSender;
    expect(isMessage({ type: 'open-settings' })).toBe(true);
    expect(canSend({ type: 'open-settings' }, sender, 'test-extension')).toBe(true);
    const result = await executeMessage({ type: 'open-settings' }, sender);
    expect(result.ok).toBe(true);
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});

describe('reliable durable Gmail delivery and visible eligibility', () => {
  function incoming(data = createDefaultData()) {
    const state = googleDefaults();
    state.gmail.connected = true;
    state.gmail.lastSync = Date.now() - 60000;
    state.gmailConnectedAt = Date.now() - 120000;
    state.pending = {
      ids: ['new-mail'],
      cursor: 'after',
      baseline: false,
      since: state.gmail.lastSync,
    };
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/labels/')
        ? json({ messagesUnread: 1 })
        : json({ labelIds: ['INBOX'], internalDate: String(Date.now()) }),
    );
    return { state, data };
  }
  it('queues new inbox test mail even if it was already read before the check', async () => {
    const { state, data } = incoming();
    await syncGmail(state, data, 'mock-private-token');
    expect(state.config.gmailMode).toBe('all');
    expect(state.gmail.check).toMatchObject({
      eligible: 1,
      queued: 1,
      reason: 'queued',
      baselineReady: true,
    });
    expect((await pendingReminderNotices())[0]?.title).toContain('Gmail inbox');
    expect((await pendingReminderNotices())[0]?.deliveryId).not.toContain('new-mail');
    expect((await pendingReminderNotices())[0]?.reminderId).not.toContain('new-mail');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    await deliverDue(data);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('preserves a legacy filter and visibly flags the ambiguous default for review', () => {
    expect(normalizeGoogleConfig({ gmailMode: 'important' })).toMatchObject({
      gmailMode: 'important',
      gmailModeNeedsReview: true,
    });
    expect(
      normalizeGoogleConfig({ gmailMode: 'important', notificationPreferencesVersion: 1 })
        .gmailModeNeedsReview,
    ).toBe(false);
  });
  it('retains eligible mail during quiet hours and delivers the deferred OS alert afterwards', async () => {
    const { state, data } = incoming();
    data.settings.quietHours = { enabled: true, start: '00:00', end: '00:00' };
    await syncGmail(state, data, 'mock-private-token');
    expect(state.gmail.check?.reason).toBe('quiet-hours');
    expect(await pendingReminderNotices()).toHaveLength(1);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    data.settings.quietHours.enabled = false;
    await deliverDue(data);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('retains muted mail and releases its queued alert when explicitly unmuted', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    const { state, data } = incoming();
    state.config.gmailMuted = true;
    await syncGmail(state, data, 'mock-private-token');
    expect(state.gmail.check?.reason).toBe('muted');
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    expect(await pendingReminderNotices()).toHaveLength(1);
    store.mochi = data;
    await writeGoogle(state);
    const result = await executeMessage(
      { type: 'google-config', patch: { gmailMuted: false } },
      { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' },
    );
    expect(result.ok).toBe(true);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('keeps an eligible unread card after OS refusal without duplicate notification attempts', async () => {
    const { state, data } = incoming();
    chromeMock.notifications.create.mockRejectedValueOnce(new Error('OS blocked'));
    await syncGmail(state, data, 'mock-private-token');
    expect(await pendingReminderNotices()).toHaveLength(1);
    expect(state.historyId).toBe('after');
    expect(state.gmail.check?.reason).toBe('os-blocked');
    await deliverDue(data);
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
  });
  it('does not permanently suppress a self-sent message before its INBOX label arrives', async () => {
    const { state, data } = incoming();
    let inbox = false;
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/history?')
        ? json({
            history: [{ labelsAdded: [{ message: { id: 'new-mail' }, labelIds: ['INBOX'] }] }],
            historyId: 'later',
          })
        : String(input).includes('/labels/')
          ? json({ messagesUnread: 1 })
          : json({ labelIds: inbox ? ['INBOX'] : ['SENT'], internalDate: String(Date.now()) }),
    );
    await syncGmail(state, data, 'mock-private-token');
    expect(state.seen).not.toContain('new-mail');
    expect(state.gmail.check?.waitingForInbox).toBe(1);
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    inbox = true;
    await syncGmail(state, data, 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(await pendingReminderNotices()).toHaveLength(1);
    const historyUrl = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .find((url) => url.includes('/history?'))!;
    expect(new URL(historyUrl).searchParams.getAll('historyTypes')).toEqual([
      'messageAdded',
      'labelAdded',
    ]);
  });
  it('sets a cursor-only first baseline so arrivals during setup are not silently marked old', async () => {
    const state = googleDefaults(),
      data = createDefaultData();
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/profile?')
        ? json({ historyId: 'baseline-cursor' })
        : json({ messagesUnread: 20 }),
    );
    await syncGmail(state, data, 'mock-private-token');
    expect(state.gmail.check?.reason).toBe('baseline');
    expect(state.historyId).toBe('baseline-cursor');
    expect(state.seen).toEqual([]);
    expect(vi.mocked(fetch).mock.calls.some((call) => String(call[0]).includes('/messages?'))).toBe(
      false,
    );
    expect(chromeMock.notifications.create).not.toHaveBeenCalled();
  });
  it('does not call Google while paused or disabled and resumes without losing its pending batch', async () => {
    for (const lifecycle of ['paused', 'disabled'] as const) {
      const { state, data } = incoming();
      data.settings.lifecycle = lifecycle;
      await syncGmail(state, data, 'mock-private-token');
      await syncGoogleService(state, data, 'gmail');
      expect(state.pending?.ids).toEqual(['new-mail']);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe('visible rolling Calendar schedules', () => {
  it('saves timed and all-day reminders across a bounded30-day window with timezone-correct9AM', async () => {
    const now = Date.parse('2030-01-15T12:00:00Z'),
      data = createDefaultData(),
      state = googleDefaults();
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        timeZone: 'America/New_York',
        items: [
          {
            id: 'timed',
            start: { dateTime: '2030-01-16T17:00:00Z' },
            end: { dateTime: '2030-01-16T18:00:00Z' },
          },
          { id: 'all-day', start: { date: '2030-01-17' }, end: { date: '2030-01-18' } },
        ],
      }),
    );
    await syncCalendar(state, data, 'mock-private-token', now);
    expect(data.reminders).toHaveLength(2);
    expect(data.reminders.map((r) => r.dueAt)).toEqual([
      Date.parse('2030-01-16T16:50:00Z'),
      Date.parse('2030-01-17T14:00:00Z'),
    ]);
    expect(state.calendar.items.every((item) => item.scheduled)).toBe(true);
    expect(state.calendar.scheduledCount).toBe(2);
    expect(state.calendar.horizonEnd).toBe(now + 30 * 86400000);
    const request = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(request.searchParams.get('timeMax')).toBe(new Date(now + 30 * 86400000).toISOString());
  });
  it('makes disabled all-day coverage explicit instead of pretending an event is scheduled', async () => {
    const state = googleDefaults(),
      data = createDefaultData();
    state.config.allDayReminders = false;
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        timeZone: 'UTC',
        items: [{ id: 'all', start: { date: '2030-01-17' }, end: { date: '2030-01-18' } }],
      }),
    );
    await syncCalendar(state, data, 'mock-private-token');
    expect(data.reminders).toHaveLength(0);
    expect(state.calendar.items[0]).toMatchObject({ allDay: true, scheduled: false });
  });
  it('preserves the previous complete schedule when a later selected calendar fails', async () => {
    const state = googleDefaults(),
      data = createDefaultData();
    state.config.calendarIds = ['primary', 'secondary'];
    const previous = {
      ...newReminder('Calendar event', Date.now() + 3600000, 'UTC'),
      source: 'calendar' as const,
    };
    data.reminders = [previous];
    state.calendar.items = [
      {
        id: 'cached',
        title: 'Calendar event',
        start: Date.now(),
        end: Date.now() + 3600000,
        url: 'https://calendar.google.com/',
        calendarId: 'selected',
        eventType: 'default',
        scheduled: true,
      },
    ];
    const before = structuredClone({ items: state.calendar.items, reminders: data.reminders });
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ items: [], timeZone: 'UTC' }))
      .mockResolvedValueOnce(json({}, 503));
    await expect(syncCalendar(state, data, 'mock-private-token')).rejects.toThrow();
    expect({ items: state.calendar.items, reminders: data.reminders }).toEqual(before);
  });
  it('uses the real durable inbox path for a notification test even if OS delivery is blocked', async () => {
    const { executeMessage } = await import('../apps/extension/src/background');
    await serial(async () => undefined);
    chromeMock.notifications.create.mockRejectedValueOnce(new Error('OS blocked'));
    const result = await executeMessage(
      { type: 'notification-test' },
      { id: 'test-extension', url: 'chrome-extension://test-extension/options.html' },
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.message).toContain('OS notification was blocked');
    expect(await pendingReminderNotices()).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('one-minute Google monitoring and expired-history recovery', () => {
  it('upgrades an existing five-minute browser alarm to the one-minute cadence', async () => {
    alarms.set(GOOGLE_ALARM, { periodInMinutes: 5 });
    await rebuildAlarms(createDefaultData(), true);
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(GOOGLE_ALARM, { periodInMinutes: 1 });
    const state = googleDefaults();
    state.gmail.connected = true;
    state.gmail.lastAttemptAt = Date.now();
    expect(publicGoogle(state).gmail.nextCheckAt).toBe(state.gmail.lastAttemptAt + 60000);
  });
  it('recovers already-read new inbox mail after history expiry and declares the bounded gap', async () => {
    const state = googleDefaults(),
      data = createDefaultData();
    state.gmail.connected = true;
    state.gmail.lastSync = Date.now() - 60000;
    state.gmailConnectedAt = Date.now() - 120000;
    state.historyId = 'expired';
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/history?')) return json({}, 404);
      if (url.includes('/profile?')) return json({ historyId: 'fresh' });
      if (url.includes('/messages?')) return json({ messages: [{ id: 'read-arrival' }] });
      if (url.includes('/labels/')) return json({ messagesUnread: 0 });
      return json({ labelIds: ['INBOX'], internalDate: String(Date.now()) });
    });
    await syncGmail(state, data, 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(state.gmail.check?.historyRecovered).toBe(true);
    const url = vi
      .mocked(fetch)
      .mock.calls.map((call) => String(call[0]))
      .find((value) => value.includes('/messages?'))!;
    expect(new URL(url).searchParams.getAll('labelIds')).toEqual(['INBOX']);
    expect((await readGoogle()).gmail.check?.historyRecovered).toBe(true);
  });
});

describe('bounded pending Gmail durability', () => {
  it('retains a valid pending history batch larger than the seen-ID cache instead of silently truncating it', async () => {
    const state = googleDefaults();
    state.gmail.connected = true;
    state.pending = {
      ids: Array.from({ length: 6001 }, (_, index) => 'queued-' + index),
      cursor: 'next',
      baseline: false,
      since: Date.now() - 60000,
    };
    await writeGoogle(state);
    expect((await readGoogle()).pending?.ids).toHaveLength(6001);
  });
});

describe('independent Gmail and local-reminder controls', () => {
  it('keeps Gmail system alerts working when only scheduled reminders are disabled', async () => {
    const data = createDefaultData();
    data.settings.remindersEnabled = false;
    data.reminders = [newReminder('Local stays paused', Date.now() - 1000, 'UTC')];
    const state = googleDefaults();
    state.gmail.connected = true;
    state.gmail.lastSync = Date.now() - 60000;
    state.pending = {
      ids: ['fresh'],
      cursor: 'next',
      baseline: false,
      since: state.gmail.lastSync,
    };
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('/labels/')
        ? json({ messagesUnread: 0 })
        : json({ labelIds: ['INBOX'], internalDate: String(Date.now()) }),
    );
    await syncGmail(state, data, 'mock-private-token');
    expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1);
    expect(data.reminders[0]?.completed).toBe(false);
  });
});
