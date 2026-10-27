import { nextOccurrence, recurrenceTime } from './time';
import type { MissedPolicy, Reminder } from './types';

export interface DeliveryClaim {
  reminder: Reminder;
  notify: boolean;
  catchUp: boolean;
  key: string | null;
}

/** Persist the returned reminder before sending a notification with the stable key. */
export function claimDelivery(
  reminder: Reminder,
  now: number,
  policy: MissedPolicy = 'notify',
): DeliveryClaim {
  if (reminder.paused || reminder.completed || reminder.dueAt > now) {
    return { reminder, notify: false, catchUp: false, key: null };
  }
  if (reminder.lastDeliveredAt === reminder.dueAt) {
    return {
      reminder: {
        ...reminder,
        ...(reminder.recurrence === 'none' ? {} : { recurrenceTime: recurrenceTime(reminder) }),
        completed: reminder.recurrence === 'none',
        dueAt: reminder.recurrence === 'none' ? reminder.dueAt : nextOccurrence(reminder, now),
      },
      notify: false,
      catchUp: false,
      key: null,
    };
  }
  const missed = now - reminder.dueAt > 60_000;
  return {
    reminder: {
      ...reminder,
      lastDeliveredAt: reminder.dueAt,
      ...(reminder.recurrence === 'none' ? {} : { recurrenceTime: recurrenceTime(reminder) }),
      completed: reminder.recurrence === 'none',
      dueAt: reminder.recurrence === 'none' ? reminder.dueAt : nextOccurrence(reminder, now),
    },
    notify: !missed || policy === 'notify',
    catchUp: missed && policy === 'catch-up',
    key: `${reminder.id}:${reminder.dueAt}`,
  };
}

export function collectDue(
  reminders: Reminder[],
  now: number,
  policy: MissedPolicy = 'notify',
): { reminders: Reminder[]; due: Reminder[]; catchUp: Reminder[] } {
  const due: Reminder[] = [];
  const catchUp: Reminder[] = [];
  const ids = new Set<string>();
  const unique = reminders.filter((reminder) => {
    if (ids.has(reminder.id)) return false;
    ids.add(reminder.id);
    return true;
  });
  const next = unique.map((reminder) => {
    const claim = claimDelivery(reminder, now, policy);
    if (claim.notify) due.push(reminder);
    if (claim.catchUp) catchUp.push(reminder);
    return claim.reminder;
  });
  return { reminders: next, due, catchUp };
}
