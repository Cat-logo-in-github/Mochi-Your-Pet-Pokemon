import { isMediaCommand } from '@mochi/shared';
import type {
  AppData,
  Reminder,
  Settings,
  ReminderNotice,
  MediaCommand,
  MediaResult,
} from '@mochi/shared';
export type GoogleService = 'calendar' | 'gmail';
export interface CalendarItem {
  id: string;
  title: string;
  start: number;
  end: number;
  url: string;
  calendarId: string;
  eventType: string;
  allDay?: boolean;
  scheduled?: boolean;
  reminderAt?: number;
}
export interface GoogleConfig {
  calendarIds: string[];
  offsetMinutes: number;
  allDayReminders: boolean;
  allDayHour: number;
  eventTypes: string[];
  gmailSenders: string[];
  gmailMuted: boolean;
  gmailMode: 'important' | 'senders' | 'all';
  notificationPreferencesVersion?: 1;
  gmailModeNeedsReview?: boolean;
}
export interface ConnectionStatus {
  connected: boolean;
  lastSync?: number;
  lastAttemptAt?: number;
  nextCheckAt?: number;
  error?: string;
  retryAt?: number;
  failures?: number;
}
export interface GmailCheck {
  checkedAt: number;
  baselineReady: boolean;
  historyRecovered?: boolean;
  examined: number;
  eligible: number;
  queued: number;
  filtered: number;
  waitingForInbox: number;
  duplicates: number;
  pending: number;
  reason:
    | 'baseline'
    | 'queued'
    | 'quiet-hours'
    | 'muted'
    | 'filtered'
    | 'no-new-mail'
    | 'processing'
    | 'waiting-inbox'
    | 'os-blocked';
}
export interface GoogleStatus {
  configured: boolean;
  platformSupported: boolean;
  monitoringState?: 'active' | 'paused' | 'disabled';
  calendar: ConnectionStatus & {
    items: CalendarItem[];
    scheduledCount?: number;
    horizonEnd?: number;
    nextReminderAt?: number;
    checkedAt?: number;
  };
  gmail: ConnectionStatus & { unread: number; check?: GmailCheck };
  config: GoogleConfig;
}
export type Message =
  | { type: 'get' }
  | { type: 'open-settings' }
  | { type: 'summon' }
  | { type: 'notification-test' }
  | { type: 'media'; command: MediaCommand }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'command'; text: string }
  | { type: 'google-workflow-open'; text: string }
  | { type: 'reminder-save'; reminder: Reminder }
  | { type: 'reminder-delete'; id: string }
  | {
      type: 'reminder-action';
      id: string;
      action: 'snooze' | 'dismiss' | 'toggle';
      minutes?: number;
      deliveryId?: string;
    }
  | { type: 'position'; x: number; y: number }
  | { type: 'import'; data: unknown }
  | { type: 'reset' }
  | { type: 'google'; service: GoogleService; action: 'connect' | 'disconnect' | 'refresh' }
  | { type: 'google-config'; patch: Partial<GoogleConfig> };
export type Response =
  | {
      ok: true;
      data: AppData;
      google: GoogleStatus;
      message?: string;
      windowId?: string;
      pendingReminders?: ReminderNotice[];
      notificationPermission?: 'granted' | 'denied' | 'unknown';
      media?: MediaResult;
    }
  | { ok: false; error: string };
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function isMessage(value: unknown): value is Message {
  if (!record(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'get':
    case 'open-settings':
    case 'summon':
    case 'reset':
    case 'notification-test':
      return true;
    case 'media':
      return isMediaCommand(value.command);
    case 'settings':
    case 'google-config':
      return record(value.patch) && Object.keys(value.patch).length < 30;
    case 'command':
    case 'google-workflow-open':
      return typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 1000;
    case 'reminder-save':
      return (
        record(value.reminder) &&
        typeof value.reminder.id === 'string' &&
        value.reminder.id.length <= 256
      );
    case 'reminder-delete':
      return typeof value.id === 'string' && value.id.length <= 256;
    case 'reminder-action':
      return (
        typeof value.id === 'string' &&
        value.id.length <= 256 &&
        ['snooze', 'dismiss', 'toggle'].includes(String(value.action)) &&
        (value.deliveryId === undefined ||
          (typeof value.deliveryId === 'string' && value.deliveryId.length <= 600)) &&
        (value.minutes === undefined ||
          (typeof value.minutes === 'number' &&
            Number.isFinite(value.minutes) &&
            value.minutes >= 1 &&
            value.minutes <= 10080))
      );
    case 'position':
      return (
        typeof value.x === 'number' &&
        typeof value.y === 'number' &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        value.x >= 0 &&
        value.x <= 1 &&
        value.y >= 0 &&
        value.y <= 1
      );
    case 'import':
      return record(value.data);
    case 'google':
      return (
        ['calendar', 'gmail'].includes(String(value.service)) &&
        ['connect', 'disconnect', 'refresh'].includes(String(value.action))
      );
    default:
      return false;
  }
}
export function isExtensionPage(sender: chrome.runtime.MessageSender, runtimeId: string): boolean {
  if (
    sender.id !== runtimeId ||
    !sender.url ||
    (sender.tab?.id !== undefined && sender.frameId !== undefined && sender.frameId !== 0)
  )
    return false;
  try {
    const url = new URL(sender.url);
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === runtimeId &&
      ['/popup.html', '/options.html'].includes(url.pathname)
    );
  } catch {
    return false;
  }
}
export function isTrustedSender(sender: chrome.runtime.MessageSender, runtimeId: string): boolean {
  if (isExtensionPage(sender, runtimeId)) return true;
  if (
    sender.id !== runtimeId ||
    sender.tab?.id === undefined ||
    sender.frameId !== 0 ||
    !sender.url
  )
    return false;
  try {
    const url = new URL(sender.url);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
export function canSend(
  message: Message,
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
): boolean {
  if (!isTrustedSender(sender, runtimeId)) return false;
  return (
    ![
      'reset',
      'import',
      'google',
      'google-config',
      'notification-test',
      'google-workflow-open',
    ].includes(message.type) || isExtensionPage(sender, runtimeId)
  );
}

export function contentData(data: AppData): AppData {
  const clean = (r: Reminder): Reminder =>
    r.source === 'calendar'
      ? { ...r, title: 'Calendar event', url: undefined, eventId: undefined, openUrlOnDue: false }
      : r;
  return {
    ...data,
    reminders: data.reminders.map(clean),
    catchUp: data.catchUp.map(clean),
    history: [],
    diagnostics: [],
  };
}
export function responseForSender(
  response: Response,
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
): Response {
  if (!response.ok || isExtensionPage(sender, runtimeId)) return response;
  return {
    ...response,
    data: contentData(response.data),
    message:
      response.message && /(?:calendar|inbox|gmail)/iu.test(response.message)
        ? 'Google status updated. Open Mochi settings for connection details.'
        : response.message,
    pendingReminders: response.pendingReminders?.map((notice) =>
      notice.reminderId.startsWith('calendar-')
        ? { ...notice, title: 'Calendar event', url: undefined }
        : notice,
    ),
    google: {
      configured: response.google.configured,
      platformSupported: response.google.platformSupported,
      calendar: {
        connected: response.google.calendar.connected,
        items: [],
        ...(typeof response.google.calendar.lastSync === 'number'
          ? { lastSync: response.google.calendar.lastSync }
          : {}),
      },
      gmail: {
        connected: response.google.gmail.connected,
        unread: 0,
        ...(typeof response.google.gmail.lastSync === 'number'
          ? { lastSync: response.google.gmail.lastSync }
          : {}),
      },
      config: {
        calendarIds: [],
        offsetMinutes: 10,
        allDayReminders: true,
        allDayHour: 9,
        eventTypes: [],
        gmailSenders: [],
        gmailMuted: true,
        gmailMode: 'all',
      },
    },
  };
}
