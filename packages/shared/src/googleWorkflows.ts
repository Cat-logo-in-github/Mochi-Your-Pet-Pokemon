import type { GoogleWorkflowPlan, Intent } from './types';
const clarify = (message: string): Intent => ({ kind: 'clarify', message });
function plan(
  service: GoogleWorkflowPlan['service'],
  action: GoogleWorkflowPlan['action'],
  url: string,
): Intent {
  const copy = {
    'search-mail': [
      'Search in Gmail',
      'Opens your search in Gmail. Mochi does not read the results or change your mailbox.',
    ],
    'compose-mail': [
      'Review a Gmail draft',
      'Opens a prefilled compose form in Gmail. Review the recipient and text there; Mochi never sends it.',
    ],
    'create-event': [
      'Review a Calendar event',
      'Opens a prefilled Google Calendar editor. Review its date and details there; save it yourself if you choose.',
    ],
    'open-agenda': [
      'Open Google Calendar',
      'Opens your Calendar on Google. No event is created or changed.',
    ],
  } as const;
  return {
    kind: 'google-workflow',
    plan: { service, action, title: copy[action][0], description: copy[action][1], url },
  };
}
export function parseGoogleWorkflow(text: string, now = Date.now()): Intent | null {
  const lower = text.toLowerCase();
  if (
    /^(?:open|show|view)(?: my)?(?: gmail)? unread (?:mail|emails?|messages?)$/u.test(lower) ||
    /^(?:open|show)(?: my)? unread(?: inbox)?$/u.test(lower)
  )
    return plan('gmail', 'search-mail', 'https://mail.google.com/mail/u/0/#search/is%3Aunread');
  const search =
    /^(?:search (?:gmail|(?:my )?(?:mail|email|inbox)) for|find (?:emails?|messages?|mail) (?:about|for)|search for emails? about) (.+)$/iu.exec(
      text,
    );
  const sender = /^(?:find|show|search for) (?:emails?|mail|messages?) from (.+)$/iu.exec(text);
  if (search || sender) {
    const query = search?.[1] || `from:${sender?.[1]}`;
    if (!query || query.length > 350) return clarify('Use a shorter Gmail search.');
    return plan(
      'gmail',
      'search-mail',
      `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`,
    );
  }
  const compose = /^(?:draft|compose|write)(?: an?)? (?:email|message)(?: to (.+))?$/iu.exec(text);
  if (compose) {
    const fields = compose[1] || '';
    const parts =
      /^([^\s]+)(?: (?:with )?subject (.+?))?(?: (?:and )?(?:body|saying) (.+))?$/iu.exec(fields);
    if (fields && !parts)
      return clarify(
        'Use draft email to name@example.com subject Your subject body Your message. Nothing is sent automatically.',
      );
    const to = parts?.[1] || '';
    if (
      to &&
      !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/iu.test(to)
    )
      return clarify(
        'Use a full email address, or say compose email to open an empty draft. Mochi does not look up contacts.',
      );
    const url = new URL('https://mail.google.com/mail/');
    url.searchParams.set('view', 'cm');
    url.searchParams.set('fs', '1');
    if (to) url.searchParams.set('to', to);
    if (parts?.[2]) url.searchParams.set('su', parts[2]);
    if (parts?.[3]) url.searchParams.set('body', parts[3]);
    return plan('gmail', 'compose-mail', url.href);
  }
  if (/^(?:send|reply|delete|archive|mark)(?: an?)? (?:email|mail|message)/iu.test(text))
    return clarify(
      'Mochi does not send or change mail. Try draft email to name@example.com, then review and send it in Gmail.',
    );
  const event =
    /^(?:schedule|create|add|plan)(?: an?)? (?:calendar )?(?:event|meeting)(?: called)? (.+?) (?:on |for )?(today|tomorrow|\d{4}-\d{2}-\d{2}) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?: for (\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h))?$/iu.exec(
      text,
    );
  if (event) {
    let hour = Number(event[3]);
    const minute = Number(event[4] || 0),
      meridian = event[5]?.toLowerCase();
    if (minute > 59 || (meridian ? hour < 1 || hour > 12 : hour > 23))
      return clarify('Choose a valid event time, for example tomorrow at 9 AM for 30 minutes.');
    if (meridian) hour = (hour % 12) + (meridian === 'pm' ? 12 : 0);
    const start = new Date(now);
    start.setHours(hour, minute, 0, 0);
    if (event[2]?.toLowerCase() === 'tomorrow') start.setDate(start.getDate() + 1);
    else if (event[2] && /^\d/u.test(event[2])) {
      const [year, month, day] = event[2].split('-').map(Number);
      start.setFullYear(year!, month! - 1, day!);
      if (
        start.getFullYear() !== year ||
        start.getMonth() !== month! - 1 ||
        start.getDate() !== day
      )
        return clarify('Choose a valid calendar date.');
    }
    const minutes = Number(event[6] || 30) * (/^h/iu.test(event[7] || '') ? 60 : 1);
    if (
      !Number.isFinite(start.getTime()) ||
      start.getTime() <= now ||
      minutes < 1 ||
      minutes > 1440
    )
      return clarify('Choose a future event lasting between 1 minute and 24 hours.');
    const compact = (value: Date) =>
      value
        .toISOString()
        .replace(/[-:]/gu, '')
        .replace(/\.\d{3}/u, '');
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', event[1] || 'Event');
    url.searchParams.set(
      'dates',
      `${compact(start)}/${compact(new Date(start.getTime() + minutes * 60000))}`,
    );
    return plan('calendar', 'create-event', url.href);
  }
  if (/^(?:schedule|create|add)(?: an?)? (?:calendar )?(?:event|meeting)\b/iu.test(text))
    return clarify(
      'Try schedule event Planning tomorrow at 9 AM for 30 minutes. Mochi opens an editor for you to review and save.',
    );
  const agenda =
    /^(?:open|go to)(?: my)? (?:google )?calendar(?: (today|tomorrow|this week))?$/iu.exec(text);
  if (agenda) {
    const date = new Date(now);
    if (agenda[1]?.toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1);
    const route = agenda[1]?.toLowerCase() === 'this week' ? 'week' : 'day';
    return plan(
      'calendar',
      'open-agenda',
      `https://calendar.google.com/calendar/u/0/r/${route}/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`,
    );
  }
  return null;
}
