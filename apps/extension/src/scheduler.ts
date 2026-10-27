import { collectDue, isQuietHours, safeUrl } from '@mochi/shared';
import type { AppData, Reminder, ReminderNotice } from '@mochi/shared';
import { addDiagnostic, writeData } from './storage';
export const SWEEP_ALARM = 'mochi:sweep';
export const DUE_ALARM = 'mochi:due';
export const GOOGLE_ALARM = 'mochi:google';
export const GOOGLE_POLL_MINUTES = 1;
const DELIVERY_KEY = 'mochi-deliveries';
export interface Delivery {
  kind?: 'gmail';
  osMuted?: boolean;
  reminderId?: string;
  dueAt: number;
  expiresAt: number;
  url?: string;
  reminder?: Reminder;
  acknowledgedAt?: number;
  notificationAttemptedAt?: number;
  osNotificationFailed?: boolean;
  urlOpenAttemptedAt?: number;
  urlOpenedAt?: number;
  urlOpenError?: boolean;
}
export async function deliveryLedger(): Promise<Record<string, Delivery>> {
  return ((await chrome.storage.local.get(DELIVERY_KEY))[DELIVERY_KEY] ?? {}) as Record<
    string,
    Delivery
  >;
}
export async function writeLedger(
  ledger: Record<string, Delivery>,
  now = Date.now(),
): Promise<void> {
  const retained = Object.fromEntries(
    Object.entries(ledger)
      .map(([key, value]): [string, Delivery] => [
        key,
        value.reminder?.source === 'calendar'
          ? {
              ...value,
              url: 'https://calendar.google.com/',
              reminder: {
                ...value.reminder,
                title: 'Calendar event',
                url: 'https://calendar.google.com/',
                eventId: undefined,
              },
            }
          : key.startsWith('mochi:gmail:')
            ? { ...value, url: 'https://mail.google.com/mail/u/0/#inbox' }
            : value,
      ])
      .filter(([, v]) => v.expiresAt > now)
      .sort((a, b) => b[1].dueAt - a[1].dueAt)
      .slice(0, 3000),
  );
  await chrome.storage.local.set({ [DELIVERY_KEY]: retained });
  // Queue changes are rare; do not reread reminders on every roaming/position update.
  for (const tab of await chrome.tabs.query({}))
    if (tab.id !== undefined)
      void chrome.tabs
        .sendMessage(tab.id, { type: 'mochi-reminders-changed' })
        .catch(() => undefined);
}
export function notificationId(reminder: Reminder): string {
  return `mochi:r:${reminder.id}:${reminder.dueAt}`;
}
function reminderDelivery(reminder: Reminder): Delivery {
  return {
    reminderId: reminder.id,
    dueAt: reminder.dueAt,
    expiresAt: Date.now() + 90 * 86400000,
    reminder: structuredClone(
      reminder.source === 'calendar'
        ? {
            ...reminder,
            title: 'Calendar event',
            url: 'https://calendar.google.com/',
            eventId: undefined,
          }
        : reminder,
    ),
    ...(reminder.url && safeUrl(reminder.url)
      ? {
          url:
            reminder.source === 'calendar'
              ? 'https://calendar.google.com/'
              : safeUrl(reminder.url)!,
        }
      : {}),
  };
}
export async function openReminderUrl(
  reminder: Reminder,
  ledger: Record<string, Delivery>,
): Promise<'skipped' | 'opened' | 'blocked'> {
  if (reminder.source !== 'local' || reminder.openUrlOnDue !== true || !reminder.url)
    return 'skipped';
  const url = safeUrl(reminder.url);
  if (!url) return 'skipped';
  const id = notificationId(reminder);
  ledger[id] ??= reminderDelivery(reminder);
  const delivery = ledger[id];
  if (delivery.urlOpenAttemptedAt !== undefined) return 'skipped';
  delivery.urlOpenAttemptedAt = Date.now();
  // Claim the side effect durably before opening. A restart never launches a duplicate tab.
  try {
    await writeLedger(ledger);
  } catch (error) {
    delete delivery.urlOpenAttemptedAt;
    throw error;
  }
  try {
    await chrome.tabs.create({ url, active: true });
    delivery.urlOpenedAt = Date.now();
  } catch {
    delivery.urlOpenError = true;
  }
  await writeLedger(ledger);
  return delivery.urlOpenError ? 'blocked' : 'opened';
}
export async function notifyReminder(
  reminder: Reminder,
  ledger: Record<string, Delivery>,
  id = notificationId(reminder),
): Promise<boolean> {
  if (ledger[id]?.notificationAttemptedAt) return false;
  ledger[id] ??= reminderDelivery(reminder);
  ledger[id].notificationAttemptedAt = Date.now();
  // Claim before calling the OS: a worker restart cannot deliver the same occurrence twice.
  await writeLedger(ledger);
  let notificationError: unknown;
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title:
        ledger[id].kind === 'gmail' ? 'Mochi - new inbox mail' : 'A little reminder from Mochi',
      message:
        reminder.source === 'calendar'
          ? 'A scheduled Calendar event is coming up. Open Google Calendar for details.'
          : reminder.title,
      buttons: [{ title: 'Snooze 5 minutes' }, { title: 'Dismiss' }],
      priority: 1,
      requireInteraction: true,
    });
  } catch (error) {
    notificationError = error;
    ledger[id].osNotificationFailed = true;
    await writeLedger(ledger);
  }
  // A visible pet reacts once too; OS notifications work independently of the overlay.
  try {
    for (const tab of await chrome.tabs.query({ active: true }))
      if (tab.id !== undefined)
        void chrome.tabs
          .sendMessage(tab.id, { type: 'mochi-notification', notice: noticeFor(id, ledger[id]) })
          .catch(() => undefined);
  } catch {
    /* No supported page is open. */
  }
  if (notificationError) throw notificationError;
  return true;
}
export async function deliverDue(data: AppData, now = Date.now()): Promise<void> {
  if (data.settings.lifecycle === 'disabled' || isQuietHours(data.settings, new Date(now))) return;
  const result = data.settings.remindersEnabled
    ? collectDue(data.reminders, now, data.settings.missedPolicy)
    : { reminders: data.reminders, due: [], catchUp: [] };
  data.reminders = result.reminders;
  data.catchUp = [...result.catchUp, ...data.catchUp]
    .filter((r, i, all) => all.findIndex((a) => a.id === r.id && a.dueAt === r.dueAt) === i)
    .slice(0, 100);
  const ledger = await deliveryLedger();
  // Save the unread snapshots before advancing schedules. A worker restart can recover either side of this boundary.
  for (const reminder of result.due)
    ledger[notificationId(reminder)] ??= reminderDelivery(reminder);
  await writeLedger(ledger);
  await writeData(data);
  const awaitingDelivery = Object.entries(ledger).filter(
    ([, delivery]) =>
      delivery.reminder &&
      (!delivery.notificationAttemptedAt ||
        (delivery.reminder.openUrlOnDue === true &&
          delivery.reminder.source === 'local' &&
          delivery.urlOpenAttemptedAt === undefined)) &&
      !delivery.acknowledgedAt &&
      delivery.expiresAt > now &&
      !(delivery.kind === 'gmail' && (delivery.osMuted || data.settings.lifecycle === 'paused')),
  );
  for (const [id, delivery] of awaitingDelivery) {
    const reminder = delivery.reminder!;
    try {
      const opened = await openReminderUrl(reminder, ledger);
      if (opened === 'blocked') {
        addDiagnostic(
          data,
          'A reminder link could not be opened. Open the linked page from the reminder inbox.',
        );
        await writeData(data);
      }
      await notifyReminder(reminder, ledger, id);
    } catch {
      addDiagnostic(
        data,
        'The OS notification could not be shown. The unread item remains in Mochi’s inbox. Check browser and system notification permissions.',
      );
      await writeData(data);
    }
  }
}
export function nextReminderTime(data: AppData, now = Date.now()): number | null {
  if (data.settings.lifecycle === 'disabled' || !data.settings.remindersEnabled) return null;
  const pending = data.reminders
    .filter((r) => !r.completed && !r.paused && r.lastDeliveredAt !== r.dueAt)
    .map((r) => r.dueAt);
  if (!pending.length) return null;
  // One moving alarm plus a durable sweep avoids the browser's finite alarm quota.
  return Math.max(now + 30000, Math.min(Math.min(...pending), now + 86400000));
}
export async function rebuildAlarms(data: AppData, googleConnected = false): Promise<void> {
  if (data.settings.lifecycle === 'disabled') {
    for (const alarm of await chrome.alarms.getAll())
      if (alarm.name.startsWith('mochi:')) await chrome.alarms.clear(alarm.name);
    return;
  }
  const needsSweep =
    data.settings.remindersEnabled && data.reminders.some((r) => !r.completed && !r.paused);
  const sweep = await chrome.alarms.get(SWEEP_ALARM);
  if (needsSweep && !sweep) await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 15 });
  else if (!needsSweep && sweep) await chrome.alarms.clear(SWEEP_ALARM);
  const next = nextReminderTime(data);
  if (next === null) await chrome.alarms.clear(DUE_ALARM);
  else {
    const desired = isQuietHours(data.settings) ? Date.now() + 15 * 60000 : next;
    const existing = await chrome.alarms.get(DUE_ALARM);
    // Reads and preference changes must never keep pushing a near-due alarm into the future.
    if (!existing || !Number.isFinite(existing.scheduledTime) || existing.scheduledTime > desired)
      await chrome.alarms.create(DUE_ALARM, { when: desired });
  }
  if (googleConnected && data.settings.lifecycle !== 'paused') {
    const googleAlarm = await chrome.alarms.get(GOOGLE_ALARM);
    if (!googleAlarm || googleAlarm.periodInMinutes !== GOOGLE_POLL_MINUTES)
      await chrome.alarms.create(GOOGLE_ALARM, { periodInMinutes: GOOGLE_POLL_MINUTES });
  } else await chrome.alarms.clear(GOOGLE_ALARM);
}

export function noticeFor(id: string, delivery: Delivery): ReminderNotice | null {
  const r = delivery.reminder;
  return r && !delivery.acknowledgedAt
    ? {
        deliveryId: id,
        reminderId: r.id,
        title: r.source === 'calendar' ? 'Calendar event' : r.title,
        dueAt: r.dueAt,
        timeZone: r.timeZone,
        ...(r.url && safeUrl(r.url)
          ? { url: r.source === 'calendar' ? 'https://calendar.google.com/' : safeUrl(r.url)! }
          : {}),
        ...(delivery.urlOpenedAt
          ? { urlOpenStatus: 'opened' as const }
          : delivery.urlOpenError
            ? { urlOpenStatus: 'blocked' as const }
            : {}),
      }
    : null;
}
export async function pendingReminderNotices(now = Date.now()): Promise<ReminderNotice[]> {
  return Object.entries(await deliveryLedger())
    .filter(([, v]) => v.expiresAt > now && !v.acknowledgedAt)
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .map(([id, v]) => noticeFor(id, v))
    .filter((n): n is ReminderNotice => !!n)
    .slice(0, 100);
}
export async function notificationPermission(): Promise<'granted' | 'denied' | 'unknown'> {
  try {
    return await chrome.notifications.getPermissionLevel();
  } catch {
    return 'unknown';
  }
}

export async function testNotificationDelivery(): Promise<boolean> {
  const now = Date.now();
  const reminder: Reminder = {
    id: 'test-' + crypto.randomUUID(),
    title:
      'Mochi test: this card stays in your inbox until you dismiss it. System notifications use the same delivery path.',
    dueAt: now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    recurrence: 'none',
    paused: false,
    completed: false,
    source: 'local',
  };
  const ledger = await deliveryLedger();
  ledger[notificationId(reminder)] = reminderDelivery(reminder);
  await writeLedger(ledger);
  try {
    await notifyReminder(reminder, ledger);
    return true;
  } catch {
    return false;
  }
}
