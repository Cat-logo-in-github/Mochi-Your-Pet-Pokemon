import {
  createDefaultData,
  isReminder,
  localTimeZone,
  newReminder,
  nextOccurrence,
  recurrenceTime,
  normalizeSettings,
  normalizeData,
  parseCommand,
  safeUrl,
  isPrivateGoogleUrl,
  validateImport,
} from '@mochi/shared';
import type { AppData } from '@mochi/shared';
import { acceptMediaReport, dispatchMediaCommand } from './media';
import { canSend, isMessage, responseForSender, isExtensionPage } from './protocol';
import type { Message, Response } from './protocol';
import { addDiagnostic, readData, serial, writeData } from './storage';
import {
  DUE_ALARM,
  GOOGLE_ALARM,
  SWEEP_ALARM,
  deliverDue,
  deliveryLedger,
  writeLedger,
  pendingReminderNotices,
  notificationPermission,
  testNotificationDelivery,
  rebuildAlarms,
} from './scheduler';
import {
  disconnectGoogle,
  GoogleError,
  normalizeGoogleConfig,
  publicGoogle,
  readGoogle,
  syncGoogleService,
  writeGoogle,
} from './google';
import type { GoogleState } from './google';

function servicesEnabled(data: AppData): boolean {
  return data.settings.lifecycle !== 'disabled' && data.settings.lifecycle !== 'paused';
}
async function finish(
  data: AppData,
  google: GoogleState,
  message?: string,
  windowId?: string,
): Promise<Extract<Response, { ok: true }>> {
  await writeData(data);
  await rebuildAlarms(data, google.calendar.connected || google.gmail.connected);
  return {
    ok: true,
    data,
    google: publicGoogle(google, data.settings.lifecycle, data.reminders),
    pendingReminders: await pendingReminderNotices(),
    notificationPermission: await notificationPermission(),
    ...(message ? { message } : {}),
    ...(windowId ? { windowId } : {}),
  };
}
export async function executeMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  fromNotification = false,
): Promise<Response> {
  const data = await readData();
  const google = await readGoogle();
  switch (message.type) {
    case 'open-settings': {
      await chrome.runtime.openOptionsPage();
      return finish(data, google, 'Opened Mochi settings.');
    }
    case 'get': {
      const windowId = String(
        sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id ?? 'default',
      );
      return {
        ok: true,
        data,
        google: publicGoogle(google, data.settings.lifecycle, data.reminders),
        windowId,
        pendingReminders: await pendingReminderNotices(),
        notificationPermission: await notificationPermission(),
      };
    }
    case 'notification-test': {
      const shown = await testNotificationDelivery();
      return finish(
        data,
        google,
        shown
          ? 'Test card saved in Mochi’s inbox and an OS notification was requested. If no system popup appears, check this browser’s Windows notification settings.'
          : 'Test card saved in Mochi’s inbox. The OS notification was blocked; allow browser/system notifications and try again.',
      );
    }
    case 'media': {
      const media = await dispatchMediaCommand(message.command);
      if (!media.ok) return { ok: false, error: media.error };
      return { ...(await finish(data, google, media.message)), media };
    }
    case 'summon': {
      data.settings.lifecycle = 'running';
      await finish(data, google);
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let delivered = false;
      for (const tab of tabs) {
        if (tab.id !== undefined)
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'mochi-summon' });
            delivered = true;
          } catch {
            /* Protected pages cannot receive overlays. */
          }
      }
      return {
        ok: true,
        data,
        google: publicGoogle(google, data.settings.lifecycle, data.reminders),
        pendingReminders: await pendingReminderNotices(),
        notificationPermission: await notificationPermission(),
        message: delivered
          ? 'Here I am. Click or carry me anywhere on this page.'
          : 'Mochi is awake. Open a normal website and call again; browser settings and stores are protected.',
      };
    }
    case 'settings': {
      data.settings = normalizeSettings({
        ...data.settings,
        ...message.patch,
        quietHours: message.patch.quietHours ?? data.settings.quietHours,
      });
      return finish(data, google, `Mochi is ${data.settings.lifecycle}.`);
    }
    case 'position': {
      const key = String(sender.tab?.windowId ?? 'default');
      data.positions = Object.fromEntries(
        Object.entries({ ...data.positions, [key]: { x: message.x, y: message.y } }).slice(-30),
      );
      return finish(data, google);
    }
    case 'google-workflow-open': {
      if (!isExtensionPage(sender, chrome.runtime.id))
        return { ok: false, error: 'Review Google actions in the Mochi toolbar or Settings.' };
      const intent = parseCommand(message.text);
      if (intent.kind !== 'google-workflow')
        return { ok: false, error: 'This Google workflow is no longer valid. Review it again.' };
      await chrome.tabs.create({ url: intent.plan.url, active: true });
      return finish(
        data,
        google,
        intent.plan.action === 'compose-mail'
          ? 'Opened a Gmail compose form. Review and send it in Gmail; Mochi has not sent anything.'
          : intent.plan.action === 'create-event'
            ? 'Opened the Calendar editor. Review and save it in Google Calendar; Mochi has not created an event.'
            : 'Opened Google for your requested view.',
      );
    }
    case 'command': {
      const intent = parseCommand(message.text, Date.now(), data.settings.shortcuts);
      switch (intent.kind) {
        case 'google-workflow':
          return finish(
            data,
            google,
            'Review this Google action in the Mochi toolbar or Settings command box. Nothing has been sent or saved.',
          );
        case 'summon':
          return executeMessage({ type: 'summon' }, sender);
        case 'navigate': {
          const url = safeUrl(intent.url);
          if (!url) return { ok: false, error: 'Mochi can only open safe HTTP or HTTPS websites.' };
          if (data.history[0]?.url === url && Date.now() - data.history[0].at < 1500)
            return finish(data, google, 'That destination was just opened.');
          await chrome.tabs.create({ url, active: true });
          if (!isPrivateGoogleUrl(url))
            data.history = [
              {
                id: crypto.randomUUID(),
                command: message.text.trim().slice(0, 300),
                url,
                at: Date.now(),
              },
              ...data.history,
            ].slice(0, 50);
          return finish(data, google, `Opened ${intent.label}.`);
        }
        case 'page-reminder': {
          if (data.reminders.length >= 1000)
            return {
              ok: false,
              error: 'Delete old reminders before adding another (limit 1,000).',
            };
          const tab =
            sender.tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
          const url = safeUrl(sender.tab ? sender.url || tab?.url || '' : tab?.url || '');
          if (!url)
            return {
              ok: false,
              error:
                'Open Mochi from the toolbar on a normal website, or use the pet on the page you want to remember.',
            };
          const reminder = newReminder(
            `Revisit: ${(tab?.title || new URL(url).hostname).slice(0, 270)}`,
            intent.dueAt,
            localTimeZone(),
          );
          reminder.url = url;
          data.reminders.push(reminder);
          return finish(
            data,
            google,
            `Page saved with a reminder for ${new Date(intent.dueAt).toLocaleString()}.`,
          );
        }
        case 'reminder': {
          if (data.reminders.length >= 1000)
            return {
              ok: false,
              error: 'Mochi supports up to 1,000 reminders. Delete completed reminders first.',
            };
          const reminder = newReminder(
            intent.title,
            intent.dueAt,
            intent.timeZone || localTimeZone(),
          );
          if (intent.url) reminder.url = intent.url;
          if (intent.openUrlOnDue) reminder.openUrlOnDue = true;
          data.reminders.push(reminder);
          return finish(
            data,
            google,
            intent.openUrlOnDue && intent.url
              ? `Reminder saved. I’ll open ${new URL(intent.url).hostname} at ${new Date(intent.dueAt).toLocaleString()}.`
              : `Reminder saved for ${new Date(intent.dueAt).toLocaleString()}.`,
          );
        }
        case 'lifecycle':
          data.settings.lifecycle = intent.value;
          return finish(data, google, `Mochi is ${intent.value}.`);
        case 'preference':
          data.settings[intent.key] = intent.value;
          return finish(
            data,
            google,
            `${intent.key === 'following' ? 'Cursor following' : 'Wandering'} ${intent.value ? 'enabled' : 'disabled'}.`,
          );
        case 'music': {
          const media = await dispatchMediaCommand({
            action: intent.action === 'resume' ? 'play' : intent.action,
            ...(intent.value !== undefined ? { value: intent.value } : {}),
          });
          if (!media.ok) return { ok: false, error: media.error };
          return { ...(await finish(data, google, media.message)), media };
        }
        case 'calendar': {
          if (!google.calendar.connected)
            return finish(
              data,
              google,
              'Connect Google Calendar in Mochi settings to see your agenda.',
            );
          if (!servicesEnabled(data))
            return finish(data, google, 'Resume Mochi to refresh your Google Calendar agenda.');
          await syncGoogleService(google, data, 'calendar');
          const now = Date.now(),
            start = new Date(now),
            end = new Date(now);
          start.setHours(0, 0, 0, 0);
          end.setHours(24, 0, 0, 0);
          if (intent.window === 'tomorrow') {
            start.setDate(start.getDate() + 1);
            end.setDate(end.getDate() + 1);
          }
          if (intent.window === 'week' || intent.window === 'next') end.setTime(now + 7 * 86400000);
          const items = google.calendar.items.filter(
            (item) =>
              item.end >= now && item.start >= start.getTime() && item.start < end.getTime(),
          );
          return finish(
            data,
            google,
            google.calendar.error ||
              `${items.length} upcoming Calendar event${items.length === 1 ? '' : 's'}${intent.window === 'today' ? ' today' : intent.window === 'tomorrow' ? ' tomorrow' : ' in the next seven days'}.${items[0] ? ` Next starts ${new Date(items[0].start).toLocaleString()}.` : ''} Open Google Calendar for private details.`,
          );
        }
        case 'email': {
          if (!google.gmail.connected)
            return finish(
              data,
              google,
              'Connect Gmail in Mochi settings to enable metadata-only new-email notifications.',
            );
          if (!servicesEnabled(data)) return finish(data, google, 'Resume Mochi to refresh Gmail.');
          await syncGoogleService(google, data, 'gmail');
          return finish(
            data,
            google,
            google.gmail.error || `Your inbox has ${google.gmail.unread} unread messages.`,
          );
        }
        case 'help':
        case 'clarify':
          return finish(data, google, intent.message);
      }
      break;
    }
    case 'reminder-save': {
      if (!isReminder(message.reminder))
        return { ok: false, error: 'That reminder has invalid fields, date, or timezone.' };
      const found = data.reminders.findIndex((r) => r.id === message.reminder.id);
      if (found < 0 && data.reminders.length >= 1000)
        return { ok: false, error: 'Delete some reminders before adding more (limit 1,000).' };
      const reminder = normalizeData({ settings: data.settings, reminders: [message.reminder] })
        .reminders[0]!;
      reminder.title = reminder.title.trim();
      if (!reminder.title) return { ok: false, error: 'Give this reminder a title.' };
      if (found >= 0) data.reminders[found] = reminder;
      else data.reminders.push(reminder);
      return finish(data, google, 'Reminder saved.');
    }
    case 'reminder-delete': {
      const deleted = data.reminders.find((r) => r.id === message.id);
      if (deleted?.source === 'calendar') {
        google.mutedEventIds = [...new Set([...google.mutedEventIds, deleted.id])].slice(-5000);
        await writeGoogle(google);
      }
      const ledger = await deliveryLedger();
      for (const [id, delivery] of Object.entries(ledger))
        if (delivery.reminderId === message.id) {
          await chrome.notifications.clear(id);
          delete ledger[id];
        }
      await writeLedger(ledger);
      data.reminders = data.reminders.filter((r) => r.id !== message.id);
      data.catchUp = data.catchUp.filter((r) => r.id !== message.id);
      return finish(data, google, 'Reminder deleted.');
    }
    case 'reminder-action': {
      const ledger = await deliveryLedger();
      const delivered = message.deliveryId ? ledger[message.deliveryId] : undefined;
      if (
        message.deliveryId &&
        (!delivered?.reminder || delivered.reminderId !== message.id || delivered.acknowledgedAt)
      )
        return {
          ok: false,
          error: 'This reminder occurrence was already handled or is no longer available.',
        };
      const reminder = data.reminders.find((r) => r.id === message.id);
      const caught = data.catchUp.find((r) => r.id === message.id);
      if (!reminder && !caught && !delivered?.reminder)
        return { ok: false, error: 'This reminder is no longer available.' };
      const target = delivered?.reminder || caught || reminder!;
      const pastOccurrence =
        !!delivered ||
        fromNotification ||
        (!!caught && !!reminder && caught.dueAt !== reminder.dueAt);
      if (message.action === 'snooze') {
        if (data.reminders.length >= 1000)
          return { ok: false, error: 'Delete some reminders before snoozing (limit 1,000).' };
        const snooze = newReminder(
          target.title,
          Date.now() + (message.minutes ?? 5) * 60000,
          target.timeZone,
        );
        if (target.url) {
          snooze.url = target.url;
          snooze.openUrlOnDue = false;
        }
        data.reminders.push(snooze);
        if (reminder && !reminder.completed && (!pastOccurrence || reminder.dueAt <= Date.now())) {
          if (reminder.recurrence !== 'none') reminder.recurrenceTime = recurrenceTime(reminder);
          reminder.lastDeliveredAt = reminder.dueAt;
          const next = nextOccurrence(reminder, Math.max(Date.now(), reminder.dueAt));
          if (Number.isFinite(next)) reminder.dueAt = next;
          else reminder.completed = true;
        }
      } else if (message.action === 'toggle' && reminder) reminder.paused = !reminder.paused;
      else if (
        message.action === 'dismiss' &&
        reminder &&
        (!pastOccurrence || reminder.dueAt <= Date.now())
      ) {
        if (reminder.recurrence !== 'none') reminder.recurrenceTime = recurrenceTime(reminder);
        reminder.lastDeliveredAt = reminder.dueAt;
        const next = nextOccurrence(reminder, Math.max(Date.now(), reminder.dueAt));
        if (reminder.recurrence !== 'none' && Number.isFinite(next)) reminder.dueAt = next;
        else reminder.completed = true;
      }
      data.catchUp = data.catchUp.filter((r) => r.id !== message.id);
      for (const [id, delivery] of Object.entries(ledger))
        if (
          delivery.reminderId === message.id &&
          (!message.deliveryId || id === message.deliveryId)
        ) {
          delivery.acknowledgedAt = Date.now();
          await chrome.notifications.clear(id);
        }
      await writeLedger(ledger);
      return finish(
        data,
        google,
        message.action === 'snooze'
          ? `Snoozed for ${message.minutes ?? 5} minutes.${target.url ? ' The linked page stays manual; automatic opening is off for this snooze.' : ''}`
          : 'Reminder updated.',
      );
    }
    case 'import': {
      const imported = validateImport(message.data);
      // Google credentials and live account state are deliberately outside backups.
      imported.reminders = imported.reminders.filter((r) => r.source !== 'calendar');
      return finish(
        imported,
        google,
        'Backup imported. Linked pages are manual; enable automatic opening separately for each reminder. Google connections remain separate.',
      );
    }
    case 'reset': {
      await disconnectGoogle(google, data, 'calendar');
      await disconnectGoogle(google, data, 'gmail');
      try {
        await chrome.identity.clearAllCachedAuthTokens();
      } catch {
        /* Some browsers do not expose the Chrome token cache API. */
      }
      for (const id of Object.keys(await deliveryLedger())) await chrome.notifications.clear(id);
      await chrome.storage.local.remove(['mochi-deliveries', 'mochi-google']);
      for (const alarm of await chrome.alarms.getAll())
        if (alarm.name.startsWith('mochi:')) await chrome.alarms.clear(alarm.name);
      const fresh = createDefaultData();
      fresh.settings.lifecycle = 'disabled';
      return finish(
        fresh,
        await readGoogle(),
        'Local data deleted. Mochi is shut down. You can resume with fresh settings.',
      );
    }
    case 'google-config': {
      google.config = normalizeGoogleConfig({ ...google.config, ...message.patch });
      if (message.patch.gmailMuted !== undefined) {
        const ledger = await deliveryLedger();
        for (const delivery of Object.values(ledger))
          if (delivery.kind === 'gmail' && !delivery.acknowledgedAt)
            delivery.osMuted = google.config.gmailMuted;
        await writeLedger(ledger);
      }
      if (google.calendar.connected) delete google.calendar.retryAt;
      await writeGoogle(google);
      if (
        servicesEnabled(data) &&
        google.calendar.connected &&
        ['calendarIds', 'offsetMinutes', 'eventTypes', 'allDayReminders', 'allDayHour'].some(
          (key) => Object.hasOwn(message.patch, key),
        )
      )
        await syncGoogleService(google, data, 'calendar');
      await deliverDue(data);
      return finish(
        data,
        google,
        'Google notification preferences saved. The selected mail filter applies to newly checked arrivals.',
      );
    }
    case 'google': {
      if (message.action === 'disconnect') await disconnectGoogle(google, data, message.service);
      else {
        if (!servicesEnabled(data))
          return {
            ok: false,
            error: 'Resume Mochi before connecting or refreshing Google services.',
          };
        if (message.action === 'connect') {
          if (message.service === 'gmail') google.gmailConnectedAt = Date.now();
          await syncGoogleService(google, data, message.service, true);
        } else {
          if (!google[message.service].connected)
            return { ok: false, error: 'Connect this Google service first.' };
          if ((google[message.service].retryAt ?? 0) > Date.now())
            return {
              ok: false,
              error:
                'Google is in quota or network backoff. Wait until the retry time shown in diagnostics.',
            };
          await syncGoogleService(google, data, message.service);
        }
      }
      return finish(
        data,
        google,
        message.action === 'disconnect'
          ? 'Disconnected and deleted this service’s cached data. Revoke account consent separately in your Google account if desired.'
          : google[message.service].error || 'Google synchronization complete.',
      );
    }
  }
  return { ok: false, error: 'Mochi could not understand this action.' };
}
export async function initialize(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const data = await readData();
  const google = await readGoogle();
  await deliverDue(data);
  await rebuildAlarms(data, google.calendar.connected || google.gmail.connected);
  await writeData(data);
}
function recover(): Promise<void> {
  return serial(async () => {
    try {
      await initialize();
    } catch {
      const data = await readData();
      addDiagnostic(
        data,
        'Mochi initialization failed. Reload the extension and check browser permissions.',
      );
      await writeData(data);
    }
  });
}
// Register synchronously, before any asynchronous initialization can suspend the worker.
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
  if (acceptMediaReport(raw, sender)) {
    sendResponse({ ok: true });
    return false;
  }
  if (!isMessage(raw) || !canSend(raw, sender, chrome.runtime.id)) {
    sendResponse({ ok: false, error: 'Refused an invalid or untrusted Mochi message.' });
    return false;
  }
  void serial(async () => {
    try {
      sendResponse(responseForSender(await executeMessage(raw, sender), sender, chrome.runtime.id));
    } catch (error) {
      sendResponse({
        ok: false,
        error:
          error instanceof GoogleError
            ? error.message
            : 'Mochi could not complete this action. Check settings and diagnostics, then try again.',
      });
    }
  });
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  void recover();
});
chrome.runtime.onStartup.addListener(() => {
  void recover();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (![DUE_ALARM, SWEEP_ALARM, GOOGLE_ALARM].includes(alarm.name)) return;
  void serial(async () => {
    const data = await readData();
    const google = await readGoogle();
    if (alarm.name === GOOGLE_ALARM && servicesEnabled(data)) {
      await syncGoogleService(google, data, 'calendar');
      await syncGoogleService(google, data, 'gmail');
    }
    await deliverDue(data);
    await finish(data, google);
  }).catch(() => undefined);
});
chrome.commands.onCommand.addListener((command) => {
  void serial(async () => {
    const data = await readData();
    if (command === 'summon-mochi') {
      await executeMessage(
        { type: 'summon' },
        { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
      );
      return;
    }
    if (command === 'shutdown-mochi') data.settings.lifecycle = 'disabled';
    else if (command === 'toggle-mochi')
      data.settings.lifecycle = data.settings.lifecycle === 'running' ? 'hidden' : 'running';
    await finish(data, await readGoogle());
  });
});
chrome.notifications.onButtonClicked.addListener((id, button) => {
  void serial(async () => {
    const delivery = (await deliveryLedger())[id];
    if (!delivery?.reminderId) return;
    if (button === 0)
      await executeMessage(
        {
          type: 'reminder-action',
          id: delivery.reminderId,
          deliveryId: id,
          action: 'snooze',
          minutes: 5,
        },
        { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
        true,
      );
    if (button === 1)
      await executeMessage(
        { type: 'reminder-action', id: delivery.reminderId, deliveryId: id, action: 'dismiss' },
        { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
        true,
      );
    // Delivery already advanced recurring schedules; dismissing this OS card must not skip the next occurrence.
    await chrome.notifications.clear(id);
  });
});
chrome.notifications.onClicked.addListener((id) => {
  void serial(async () => {
    const delivery = (await deliveryLedger())[id];
    const url = delivery?.url && safeUrl(delivery.url);
    if (url) await chrome.tabs.create({ url, active: true });
    else await chrome.runtime.openOptionsPage();
    await chrome.notifications.clear(id);
  });
});
void recover();
