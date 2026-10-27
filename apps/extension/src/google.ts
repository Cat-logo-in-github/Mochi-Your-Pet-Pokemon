import { isQuietHours, parseLocalDateTime, safeUrl } from '@mochi/shared';
import type { AppData, Reminder } from '@mochi/shared';
import type {
  CalendarItem,
  GoogleConfig,
  GoogleService,
  GoogleStatus,
  GmailCheck,
} from './protocol';
import { deliveryLedger, writeLedger, deliverDue } from './scheduler';
import { addDiagnostic } from './storage';
const GOOGLE_KEY = 'mochi-google';
export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
  gmail: 'https://www.googleapis.com/auth/gmail.metadata',
} as const;
const DEFAULT_CONFIG: GoogleConfig = {
  calendarIds: ['primary'],
  offsetMinutes: 10,
  allDayReminders: true,
  allDayHour: 9,
  eventTypes: ['default'],
  gmailSenders: [],
  gmailMuted: false,
  gmailMode: 'all',
  notificationPreferencesVersion: 1,
};
interface PendingGmail {
  ids: string[];
  cursor: string;
  baseline: boolean;
  since: number;
}
export interface GoogleState extends GoogleStatus {
  mutedEventIds: string[];
  pending?: PendingGmail;
  historyId?: string;
  seen: string[];
  gmailConnectedAt?: number;
}
export class GoogleError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function googleDefaults(): GoogleState {
  const configured = !!chrome.runtime.getManifest().oauth2?.client_id;
  const platformSupported = !/Edg\//.test(globalThis.navigator?.userAgent ?? '');
  return {
    configured,
    platformSupported,
    calendar: { connected: false, items: [] },
    gmail: { connected: false, unread: 0 },
    config: structuredClone(DEFAULT_CONFIG),
    seen: [],
    mutedEventIds: [],
  };
}
export function normalizeGoogleConfig(value: Partial<GoogleConfig>): GoogleConfig {
  const strings = (v: unknown, fallback: string[]) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 250)
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 20)
      : fallback;
  const ids = strings(value.calendarIds, DEFAULT_CONFIG.calendarIds);
  const types = strings(value.eventTypes, DEFAULT_CONFIG.eventTypes).filter((x) =>
    ['default', 'birthday', 'focusTime', 'fromGmail', 'outOfOffice', 'workingLocation'].includes(x),
  );
  return {
    calendarIds: ids.length ? ids : ['primary'],
    offsetMinutes:
      typeof value.offsetMinutes === 'number' &&
      [0, 5, 10, 15, 30, 60].includes(value.offsetMinutes)
        ? value.offsetMinutes
        : 10,
    allDayReminders: value.allDayReminders !== false,
    allDayHour:
      typeof value.allDayHour === 'number' &&
      Number.isInteger(value.allDayHour) &&
      value.allDayHour >= 0 &&
      value.allDayHour <= 23
        ? value.allDayHour
        : 9,
    eventTypes: types,
    gmailSenders: [
      ...new Set(
        strings(value.gmailSenders, [])
          .map((x) => x.toLowerCase())
          .filter((x) =>
            /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/iu.test(
              x,
            ),
          ),
      ),
    ],
    gmailMuted: value.gmailMuted === true,
    gmailMode:
      value.gmailMode === 'important' || value.gmailMode === 'senders' ? value.gmailMode : 'all',
    ...(value.notificationPreferencesVersion === 1
      ? { notificationPreferencesVersion: 1 as const }
      : {}),
    gmailModeNeedsReview:
      (value.gmailMode === 'important' || value.gmailMode === 'senders') &&
      value.notificationPreferencesVersion !== 1,
  };
}
function safeGoogleMessage(value: unknown): string {
  const message = typeof value === 'string' ? value : '';
  if (/bounded|page budget|exceeds|repeated page/iu.test(message))
    return 'Google returned an incomplete or over-budget check. Previous schedules are retained. Open Google to check missed items, then retry.';
  if (/quota|rate.limit/iu.test(message))
    return 'Google quota reached. Mochi will retry with backoff.';
  if (/not configured|client|extension ID|publisher|setup/iu.test(message))
    return 'Google API monitoring is off in this public build. Use Google web shortcuts, or make a private build with your own project.';
  if (/authoriz|consent|sign.in|revok/iu.test(message))
    return 'Google authorization is unavailable. Connect this service again.';
  if (/permission|allow this/iu.test(message))
    return 'Allow the selected Google service from its Connect button.';
  if (/denied|enablement|scope/iu.test(message))
    return 'Google denied access. Check your personal project service configuration.';
  return 'Google synchronization is unavailable. Check the connection and try again later.';
}
function safeGoogleState(input: Partial<GoogleState>): GoogleState {
  const defaults = googleDefaults();
  const connection = (
    raw: Partial<GoogleState['calendar']> | Partial<GoogleState['gmail']> | undefined,
  ) => ({
    connected: defaults.configured && raw?.connected === true,
    ...(typeof raw?.lastAttemptAt === 'number' && Number.isFinite(raw.lastAttemptAt)
      ? { lastAttemptAt: raw.lastAttemptAt }
      : {}),
    ...(typeof raw?.lastSync === 'number' && Number.isFinite(raw.lastSync)
      ? { lastSync: raw.lastSync }
      : {}),
    ...(typeof raw?.retryAt === 'number' && Number.isFinite(raw.retryAt)
      ? { retryAt: raw.retryAt }
      : {}),
    ...(typeof raw?.failures === 'number' && Number.isFinite(raw.failures)
      ? { failures: Math.min(100, Math.max(0, raw.failures)) }
      : {}),
    ...(raw?.error ? { error: safeGoogleMessage(raw.error) } : {}),
  });
  const ids = (value: unknown, maximum = 5000) =>
    Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256)
          .slice(-maximum)
      : [];
  const items = (Array.isArray(input.calendar?.items) ? input.calendar.items : [])
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        item.id.length <= 256 &&
        Number.isFinite(item.start) &&
        Number.isFinite(item.end),
    )
    .slice(0, 500)
    .map((item) => ({
      id: item.id,
      title: 'Calendar event',
      allDay: item.allDay === true,
      scheduled: item.scheduled === true,
      ...(Number.isFinite(item.reminderAt) ? { reminderAt: item.reminderAt } : {}),
      start: item.start,
      end: item.end,
      url: 'https://calendar.google.com/',
      calendarId: 'selected',
      eventType: [
        'default',
        'birthday',
        'focusTime',
        'fromGmail',
        'outOfOffice',
        'workingLocation',
      ].includes(item.eventType)
        ? item.eventType
        : 'default',
    }));
  const check = input.gmail?.check;
  const reasons = [
    'baseline',
    'queued',
    'quiet-hours',
    'muted',
    'filtered',
    'no-new-mail',
    'processing',
    'waiting-inbox',
    'os-blocked',
  ];
  const safeCheck =
    check && Number.isFinite(check.checkedAt) && reasons.includes(check.reason)
      ? ({
          checkedAt: check.checkedAt,
          baselineReady: check.baselineReady === true,
          historyRecovered: check.historyRecovered === true,
          ...Object.fromEntries(
            [
              'examined',
              'eligible',
              'queued',
              'filtered',
              'waitingForInbox',
              'duplicates',
              'pending',
            ].map((key) => [
              key,
              Math.min(
                1000000,
                Math.max(0, Number((check as unknown as Record<string, unknown>)[key]) || 0),
              ),
            ]),
          ),
          reason: check.reason,
        } as GmailCheck)
      : undefined;
  return {
    ...defaults,
    config: normalizeGoogleConfig(input.config || {}),
    calendar: {
      ...connection(input.calendar),
      items: defaults.configured ? items : [],
      ...(Number.isFinite(input.calendar?.scheduledCount)
        ? { scheduledCount: input.calendar!.scheduledCount }
        : {}),
      ...(Number.isFinite(input.calendar?.horizonEnd)
        ? { horizonEnd: input.calendar!.horizonEnd }
        : {}),
      ...(Number.isFinite(input.calendar?.checkedAt)
        ? { checkedAt: input.calendar!.checkedAt }
        : {}),
    },
    gmail: {
      ...connection(input.gmail),
      ...(safeCheck ? { check: safeCheck } : {}),
      unread:
        defaults.configured &&
        typeof input.gmail?.unread === 'number' &&
        Number.isFinite(input.gmail.unread)
          ? Math.min(1000000000, Math.max(0, Math.floor(input.gmail.unread)))
          : 0,
    },
    mutedEventIds: ids(input.mutedEventIds),
    seen: defaults.configured ? ids(input.seen) : [],
    ...(defaults.configured && typeof input.historyId === 'string' && input.historyId.length <= 256
      ? { historyId: input.historyId }
      : {}),
    ...(typeof input.gmailConnectedAt === 'number' && Number.isFinite(input.gmailConnectedAt)
      ? { gmailConnectedAt: input.gmailConnectedAt }
      : {}),
    ...(defaults.configured &&
    input.pending &&
    typeof input.pending.cursor === 'string' &&
    input.pending.cursor.length <= 256 &&
    Number.isFinite(input.pending.since)
      ? {
          pending: {
            ids: ids(input.pending.ids, 25000),
            cursor: input.pending.cursor,
            baseline: input.pending.baseline === true,
            since: input.pending.since,
          },
        }
      : {}),
  };
}
export async function readGoogle(): Promise<GoogleState> {
  const raw = (await chrome.storage.local.get(GOOGLE_KEY))[GOOGLE_KEY];
  return safeGoogleState(raw && typeof raw === 'object' ? (raw as Partial<GoogleState>) : {});
}
export async function writeGoogle(state: GoogleState): Promise<void> {
  await chrome.storage.local.set({ [GOOGLE_KEY]: safeGoogleState(state) });
}
export function publicGoogle(
  state: GoogleState,
  lifecycle = 'running',
  reminders?: Reminder[],
): GoogleStatus {
  state = safeGoogleState(state);
  if (reminders) {
    const pending = reminders.filter(
      (reminder) => reminder.source === 'calendar' && !reminder.completed && !reminder.paused,
    );
    state.calendar.scheduledCount = pending.length;
    if (pending.length)
      state.calendar.nextReminderAt = Math.min(...pending.map((reminder) => reminder.dueAt));
  }
  return {
    monitoringState:
      lifecycle === 'disabled' ? 'disabled' : lifecycle === 'paused' ? 'paused' : 'active',
    configured: state.configured,
    platformSupported: state.platformSupported,
    calendar: {
      ...state.calendar,
      ...(state.calendar.connected && !['paused', 'disabled'].includes(lifecycle)
        ? {
            nextCheckAt: Math.max(
              state.calendar.retryAt || 0,
              (state.calendar.lastAttemptAt || state.calendar.lastSync || Date.now()) + 60000,
            ),
          }
        : {}),
    },
    gmail: {
      ...state.gmail,
      ...(state.gmail.connected && !['paused', 'disabled'].includes(lifecycle)
        ? {
            nextCheckAt: Math.max(
              state.gmail.retryAt || 0,
              (state.gmail.lastAttemptAt || state.gmail.lastSync || Date.now()) + 60000,
            ),
          }
        : {}),
    },
    config: state.config,
  };
}
export async function getGoogleToken(service: GoogleService, interactive = false): Promise<string> {
  if (!chrome.runtime.getManifest().oauth2?.client_id)
    throw new GoogleError(
      0,
      'Google API monitoring is off in this public build. Use Google web shortcuts, or make a private build with your own project.',
    );
  if (/Edg\//.test(globalThis.navigator?.userAgent ?? ''))
    throw new GoogleError(
      0,
      'Google OAuth is supported by this build in Chrome only. Edge local pet and reminders remain available.',
    );
  const origin =
    service === 'calendar' ? 'https://www.googleapis.com/*' : 'https://gmail.googleapis.com/*';
  if (!(await chrome.permissions.contains({ origins: [origin] })))
    throw new GoogleError(0, 'Allow this Google API from the Connect button in Mochi settings.');
  try {
    const result = await chrome.identity.getAuthToken({
      interactive,
      scopes: [SCOPES[service]],
      enableGranularPermissions: true,
    });
    if (!result.token || (result.grantedScopes && !result.grantedScopes.includes(SCOPES[service])))
      throw new Error('No consent');
    return result.token;
  } catch {
    throw new GoogleError(
      401,
      interactive
        ? 'Google consent was cancelled or unavailable. Check the OAuth client, extension ID, test users, and Chrome sign-in.'
        : 'Google authorization expired or was revoked. Connect this service again.',
    );
  }
}
export async function apiJson<T>(token: string, input: string): Promise<T> {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    !['www.googleapis.com', 'gmail.googleapis.com'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new GoogleError(0, 'Refused an untrusted API destination.');
  let response: globalThis.Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new GoogleError(503, 'Google is temporarily unreachable. Mochi will retry with backoff.');
  }
  if (!response.ok) {
    let rateLimited = response.status === 429;
    if (response.status === 403) {
      try {
        const body = (await response.json()) as { error?: { errors?: { reason?: string }[] } };
        rateLimited =
          body.error?.errors?.some((e) => /rateLimit|quota/i.test(e.reason ?? '')) ?? false;
      } catch {
        /* Never expose response bodies. */
      }
    }
    if (response.status === 401) {
      await chrome.identity.removeCachedAuthToken({ token });
      throw new GoogleError(
        401,
        'Google authorization expired or was revoked. Connect this service again.',
      );
    }
    throw new GoogleError(
      rateLimited ? 429 : response.status,
      rateLimited
        ? 'Google quota reached. Mochi will retry with backoff.'
        : response.status === 403
          ? 'Google denied access. Check API enablement and consent scopes.'
          : response.status === 404
            ? 'Google data is no longer available.'
            : 'Google could not complete the request.',
    );
  }
  return (await response.json()) as T;
}
export async function paginated<T>(
  token: string,
  input: string,
  itemsKey: string,
  maxPages = 50,
): Promise<{ items: T[]; last: Record<string, unknown> }> {
  const items: T[] = [];
  let pageToken: string | undefined;
  const visited = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(input);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const last = await apiJson<Record<string, unknown>>(token, url.href);
    if (Array.isArray(last[itemsKey])) items.push(...(last[itemsKey] as T[]));
    if (typeof last.nextPageToken !== 'string' || !last.nextPageToken) return { items, last };
    pageToken = last.nextPageToken;
    if (visited.has(pageToken))
      throw new GoogleError(
        503,
        'Google returned a repeated page. No synchronization data was replaced.',
      );
    visited.add(pageToken);
  }
  throw new GoogleError(
    503,
    'This account exceeds the bounded synchronization page budget. Select fewer calendars or a smaller inbox.',
  );
}
interface CalendarEvent {
  id?: string;
  summary?: string;
  status?: string;
  htmlLink?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}
function calendarEpoch(value: CalendarEvent['start'], fallbackZone: string): number {
  if (value?.dateTime) return Date.parse(value.dateTime);
  if (value?.date) return parseLocalDateTime(`${value.date}T00:00`, value.timeZone || fallbackZone);
  return NaN;
}
export function trustedCalendarUrl(input: unknown): string {
  if (typeof input !== 'string' || !safeUrl(input)) return 'https://calendar.google.com/';
  const url = new URL(input);
  const supported =
    (url.hostname === 'calendar.google.com' &&
      /^\/(?:calendar\/)?(?:u\/\d+\/)?(?:event|r\/event)(?:\/|$)/.test(url.pathname)) ||
    (url.hostname === 'www.google.com' && url.pathname === '/calendar/event');
  return url.protocol === 'https:' && supported ? url.href : 'https://calendar.google.com/';
}
async function stableEventId(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return `calendar-${Array.from(new Uint8Array(bytes))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}
export async function syncCalendar(
  state: GoogleState,
  data: AppData,
  token: string,
  now = Date.now(),
): Promise<void> {
  const collected: CalendarItem[] = [];
  const generated: Reminder[] = [];
  for (const calendarId of state.config.calendarIds) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.search = new URLSearchParams({
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 30 * 86400000).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: 'items(id,status,eventType,start,end),nextPageToken,timeZone',
    }).toString();
    for (const type of state.config.eventTypes) url.searchParams.append('eventTypes', type);
    const result = await paginated<CalendarEvent>(token, url.href, 'items', 5);
    if (result.items.length + collected.length > 1000)
      throw new GoogleError(
        0,
        'The selected calendars exceed Mochi’s 1,000-event synchronization budget. Select fewer calendars.',
      );
    const zone =
      typeof result.last.timeZone === 'string'
        ? result.last.timeZone
        : Intl.DateTimeFormat().resolvedOptions().timeZone;
    for (const event of result.items) {
      if (!event.id || event.status === 'cancelled') continue;
      const start = calendarEpoch(event.start, zone);
      const end = calendarEpoch(event.end, zone);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const id = await stableEventId(`${calendarId}:${event.id}:${start}`);
      const title = 'Calendar event';
      const target = 'https://calendar.google.com/';
      const item: CalendarItem = {
        id,
        title,
        start,
        end,
        url: target,
        calendarId: 'selected',
        eventType: event.eventType || 'default',
        allDay: !event.start?.dateTime,
        scheduled: false,
      };
      collected.push(item);
      if (
        state.mutedEventIds.includes(id) ||
        (!event.start?.dateTime && !state.config.allDayReminders)
      )
        continue;
      const dueAt = event.start?.dateTime
        ? start - state.config.offsetMinutes * 60000
        : parseLocalDateTime(
            `${event.start!.date}T${String(state.config.allDayHour).padStart(2, '0')}:00`,
            event.start?.timeZone || zone,
          );
      if (!Number.isFinite(dueAt)) continue;
      item.scheduled = true;
      item.reminderAt = dueAt;
      const previous = data.reminders.find((r) => r.id === id && r.dueAt === dueAt);
      generated.push(
        previous
          ? { ...previous, title, url: target }
          : {
              id,
              title,
              dueAt,
              timeZone: event.start?.timeZone || zone,
              recurrence: 'none',
              paused: false,
              completed: false,
              source: 'calendar',
              url: target,
            },
      );
    }
  }
  // A complete bounded snapshot removes cancelled/moved events and preserves occurrence claims.
  const combined = [...data.reminders.filter((r) => r.source !== 'calendar'), ...generated];
  if (combined.length > 1000)
    throw new GoogleError(
      0,
      'The selected calendars exceed Mochi’s 1,000-reminder budget. Select fewer calendars.',
    );
  data.reminders = combined;
  state.calendar.scheduledCount = generated.filter(
    (reminder) => !reminder.completed && !reminder.paused,
  ).length;
  state.calendar.horizonEnd = now + 30 * 86400000;
  state.calendar.checkedAt = now;
  state.calendar.items = collected.sort((a, b) => a.start - b.start).slice(0, 500);
}
interface GmailMessage {
  id?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name?: string; value?: string }[] };
}
interface HistoryRecord {
  labelsAdded?: { message?: { id?: string }; labelIds?: string[] }[];
  messagesAdded?: { message?: { id?: string } }[];
}
export async function gmailChanges(
  state: GoogleState,
  token: string,
): Promise<{ ids: string[]; cursor: string; baseline: boolean }> {
  if (state.historyId) {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
    url.search = new URLSearchParams({
      startHistoryId: state.historyId,
      historyTypes: 'messageAdded',
      maxResults: '500',
      fields:
        'history(messagesAdded(message(id)),labelsAdded(message(id),labelIds)),historyId,nextPageToken',
    }).toString();
    url.searchParams.append('historyTypes', 'labelAdded');
    try {
      const result = await paginated<HistoryRecord>(token, url.href, 'history');
      const ids = [
        ...new Set(
          result.items.flatMap((h) =>
            [
              ...(h.messagesAdded?.map((m) => m.message?.id) || []),
              ...(h.labelsAdded
                ?.filter((change) => change.labelIds?.includes('INBOX'))
                .map((change) => change.message?.id) || []),
            ].filter((id): id is string => !!id),
          ),
        ),
      ];
      if (ids.length > 25000)
        throw new GoogleError(
          503,
          'Gmail changes exceed the bounded delivery budget. The previous cursor is retained; open Gmail to review missed items.',
        );
      return { ids, cursor: String(result.last.historyId ?? state.historyId), baseline: false };
    } catch (error) {
      if (!(error instanceof GoogleError) || error.status !== 404) throw error;
    }
  }
  // Snapshot the cursor before inbox pagination so messages arriving during the baseline are picked up next time.
  const profile = await apiJson<{ historyId: string }>(
    token,
    'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId',
  );
  if (!state.gmail.lastSync && !state.historyId)
    return { ids: [], cursor: profile.historyId, baseline: true };
  const result = await paginated<{ id?: string }>(
    token,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=100&fields=messages(id),nextPageToken',
    'messages',
  );
  return {
    ids: result.items.map((m) => m.id).filter((id): id is string => !!id),
    cursor: profile.historyId,
    baseline: true,
  };
}
export async function syncGmail(
  state: GoogleState,
  data: AppData,
  token: string,
  now = Date.now(),
): Promise<void> {
  if (data.settings.lifecycle === 'disabled' || data.settings.lifecycle === 'paused') return;
  if (!state.pending) {
    const batch = await gmailChanges(state, token);
    state.pending = { ...batch, since: state.gmail.lastSync || state.gmailConnectedAt || now };
    await writeGoogle(state);
  }
  const change = state.pending,
    seen = new Set(state.seen),
    ledger = await deliveryLedger();
  const check: GmailCheck = {
    checkedAt: now,
    baselineReady: true,
    historyRecovered: change.baseline && !!state.gmail.lastSync,
    examined: 0,
    eligible: 0,
    queued: 0,
    filtered: 0,
    waitingForInbox: 0,
    duplicates: 0,
    pending: change.ids.length,
    reason: 'no-new-mail',
  };
  const quiet = isQuietHours(data.settings, new Date(now)),
    started = Date.now();
  if (change.baseline && !state.gmail.lastSync) {
    // A cursor-only initial baseline avoids treating a message arriving during inbox pagination as old.
    for (const id of change.ids) seen.add(id);
    change.ids = [];
    check.reason = 'baseline';
  } else {
    for (const id of change.ids.slice(0, 50)) {
      if (Date.now() - started > 20000) break;
      check.examined++;
      if (seen.has(id)) {
        check.duplicates++;
      } else {
        const needsSender =
          state.config.gmailMode !== 'all' && state.config.gmailSenders.length > 0;
        const url = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
        );
        url.search = new URLSearchParams({
          format: 'metadata',
          fields: needsSender
            ? 'id,labelIds,internalDate,payload(headers)'
            : 'id,labelIds,internalDate',
        }).toString();
        if (needsSender) url.searchParams.set('metadataHeaders', 'From');
        let message: GmailMessage | null = null;
        try {
          message = await apiJson<GmailMessage>(token, url.href);
        } catch (error) {
          if (!(error instanceof GoogleError) || error.status !== 404) throw error;
        }
        const received = Number(message?.internalDate || 0);
        if (!message?.labelIds?.includes('INBOX')) {
          // A self-sent message may be SENT first and receive INBOX later; do not permanently mark it seen.
          check.waitingForInbox++;
        } else if (
          (change.baseline && received < change.since) ||
          (state.gmailConnectedAt && received < state.gmailConnectedAt)
        ) {
          check.filtered++;
          seen.add(id);
        } else {
          const from = needsSender
            ? message.payload?.headers?.find((header) => header.name?.toLowerCase() === 'from')
                ?.value || ''
            : '';
          const address = (/<([^>]+)>/u.exec(from)?.[1] || from).trim().toLowerCase();
          const eligible =
            state.config.gmailMode === 'all' ||
            state.config.gmailSenders.includes(address) ||
            (state.config.gmailMode === 'important' && message.labelIds.includes('IMPORTANT'));
          if (eligible) {
            check.eligible++;
            const opaque = await stableEventId(`gmail:${id}`);
            const deliveryId = `mochi:gmail:${opaque.replace('calendar-', '')}`;
            if (!ledger[deliveryId] && !ledger[`mochi:gmail:${id}`]) {
              const dueAt = Number.isFinite(received) && received > 0 ? received : now;
              const reminder: Reminder = {
                id: opaque.replace('calendar-', 'gmail-'),
                title: 'New mail arrived in your Gmail inbox.',
                dueAt,
                timeZone: 'UTC',
                recurrence: 'none',
                paused: false,
                completed: false,
                source: 'local',
                url: 'https://mail.google.com/mail/u/0/#inbox',
                openUrlOnDue: false,
              };
              ledger[deliveryId] = {
                kind: 'gmail',
                reminderId: reminder.id,
                dueAt,
                expiresAt: now + 90 * 86400000,
                url: reminder.url,
                reminder,
                osMuted: state.config.gmailMuted,
              };
              // Queue before committing the history cursor or attempting an OS notification.
              await writeLedger(ledger);
              check.queued++;
            } else check.duplicates++;
          } else check.filtered++;
          seen.add(id);
        }
      }
      change.ids = change.ids.filter((value) => value !== id);
      state.seen = [...seen].slice(-5000);
      await writeGoogle(state);
    }
    check.reason = check.queued
      ? state.config.gmailMuted
        ? 'muted'
        : quiet
          ? 'quiet-hours'
          : 'queued'
      : check.filtered
        ? 'filtered'
        : change.ids.length
          ? 'processing'
          : 'no-new-mail';
  }
  if (check.waitingForInbox && !check.queued && !check.filtered) check.reason = 'waiting-inbox';
  state.seen = [...seen].slice(-5000);
  check.pending = change.ids.length;
  state.gmail.check = check;
  if (!change.ids.length) {
    state.historyId = change.cursor;
    delete state.pending;
  }
  await writeGoogle(state);
  // Existing queued items survive quiet hours, mute, OS refusal and worker restarts.
  await deliverDue(data, now);
  const inbox = await apiJson<{ messagesUnread?: number }>(
    token,
    'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX?fields=messagesUnread',
  );
  state.gmail.unread = inbox.messagesUnread ?? 0;
  const outcomes = await deliveryLedger();
  if (
    check.queued &&
    Object.values(outcomes).some(
      (delivery) =>
        delivery.kind === 'gmail' &&
        delivery.osNotificationFailed &&
        (delivery.notificationAttemptedAt || 0) >= started,
    )
  )
    check.reason = 'os-blocked';
  state.gmail.check = check;
  await writeGoogle(state);
}
export async function syncGoogleService(
  state: GoogleState,
  data: AppData,
  service: GoogleService,
  interactive = false,
): Promise<void> {
  const connection = state[service];
  if (data.settings.lifecycle === 'disabled' || data.settings.lifecycle === 'paused') return;
  if (!interactive && (!connection.connected || (connection.retryAt ?? 0) > Date.now())) return;
  connection.lastAttemptAt = Date.now();
  try {
    const token = await getGoogleToken(service, interactive);
    if (service === 'calendar') await syncCalendar(state, data, token);
    else await syncGmail(state, data, token);
    connection.connected = true;
    connection.lastSync = Date.now();
    delete connection.error;
    delete connection.retryAt;
    delete connection.failures;
  } catch (error) {
    const problem =
      error instanceof GoogleError
        ? error
        : new GoogleError(503, 'Google synchronization failed. Mochi will retry later.');
    problem.message = safeGoogleMessage(problem.message);
    connection.error = problem.message;
    if (problem.status === 401) connection.connected = false;
    connection.failures = (connection.failures ?? 0) + 1;
    connection.retryAt =
      Date.now() +
      Math.min(6 * 3600000, 5 * 60000 * 2 ** Math.min(connection.failures - 1, 7)) +
      Math.floor(Math.random() * 30000);
    addDiagnostic(data, `${service === 'calendar' ? 'Calendar' : 'Gmail'}: ${problem.message}`);
    if (interactive) throw problem;
  } finally {
    await writeGoogle(state);
  }
}
export async function disconnectGoogle(
  state: GoogleState,
  data: AppData,
  service: GoogleService,
): Promise<void> {
  try {
    const token = await getGoogleToken(service);
    await chrome.identity.removeCachedAuthToken({ token });
  } catch {
    /* Consent may already be revoked. */
  }
  if (service === 'calendar') {
    state.calendar = { connected: false, items: [] };
    state.mutedEventIds = [];
    data.reminders = data.reminders.filter((r) => r.source !== 'calendar');
  } else {
    state.gmail = { connected: false, unread: 0 };
    state.seen = [];
    delete state.historyId;
    delete state.pending;
    delete state.gmailConnectedAt;
  }
  const ledger = await deliveryLedger();
  for (const [key, delivery] of Object.entries(ledger))
    if (
      service === 'gmail'
        ? key.startsWith('mochi:gmail:')
        : delivery.reminderId?.startsWith('calendar-')
    ) {
      await chrome.notifications.clear(key);
      delete ledger[key];
    }
  await writeLedger(ledger);
  await writeGoogle(state);
}
