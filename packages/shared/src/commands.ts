import { parseGoogleWorkflow } from './googleWorkflows';
import { DEFAULT_SETTINGS } from './storage';
import { localTimeZone } from './time';
import type { Intent } from './types';
import { safeUrl, youtubeSearch } from './urls';

const clarify = (message: string): Intent => ({ kind: 'clarify', message });
const reminderUnits = '(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w)';
function reminderIntent(title: string, dueAt: number, timeZone = localTimeZone()): Intent {
  const tokens = title.match(/https?:\/\/[^\s<>"']+/giu) || [];
  const otherSchemes =
    title
      .replace(/https?:\/\/[^\s<>"']+/giu, ' ')
      .match(/\b(?:[a-z][a-z\d+.-]*:(?=\S)|https?\s*:)/giu) || [];
  if (tokens.length > 1) return clarify('Use one HTTP or HTTPS link per reminder.');
  if (otherSchemes.length)
    return clarify('Use a complete, safe http:// or https:// link for this reminder.');
  if (!tokens.length) return { kind: 'reminder', title, dueAt, timeZone };
  let token = tokens[0]!;
  if (((token.split(/[?#]/u)[0] || token).match(/https?:\/\//giu)?.length || 0) > 1)
    return clarify('Use one HTTP or HTTPS link per reminder.');
  const withoutSentence = token.replace(/[.!?,;]+$/u, '');
  if (
    withoutSentence.endsWith(')') &&
    (withoutSentence.match(/\)/gu)?.length || 0) > (withoutSentence.match(/\(/gu)?.length || 0)
  )
    token = withoutSentence;
  while (
    token.endsWith(')') &&
    (token.match(/\)/gu)?.length || 0) > (token.match(/\(/gu)?.length || 0)
  )
    token = token.slice(0, -1);
  const url = safeUrl(token);
  if (!url) return clarify('That link is invalid. Use one complete, safe http:// or https:// URL.');
  return { kind: 'reminder', title, dueAt, timeZone, url, openUrlOnDue: true };
}

export function parseCommand(
  input: string,
  now = Date.now(),
  shortcuts: Record<string, string> = DEFAULT_SETTINGS.shortcuts,
): Intent {
  if (typeof input !== 'string' || input.length > 500) {
    return clarify('Please use a command of 500 characters or fewer.');
  }
  const normalized = input.trim().replace(/[’‘]/gu, "'").replace(/\s+/gu, ' ');
  // A literal URL's trailing query punctuation belongs to that URL.
  const text = /https?:\/\/\S+$/iu.test(normalized)
    ? normalized
    : normalized.replace(/[.!?]+$/u, '');
  const lower = text.toLowerCase();
  if (!text) return clarify('What would you like Mochi to do?');
  if (/^(?:come here(?: mochi)?|call mochi|here kitty)$/u.test(lower)) return { kind: 'summon' };
  if (/^(?:help|what can you do)$/u.test(lower)) {
    return {
      kind: 'help',
      message:
        'Try "come here", "play Mercy", "open GitHub", "remind me in 10 minutes to stretch", "hide the pet", or "show my next event".',
    };
  }
  const lifecycle =
    /^(pause|resume|hide|show|shutdown|shut down|disable|quit)(?: (?:the )?pet| mochi)?$/u.exec(
      lower,
    );
  if (lifecycle) {
    const values = {
      pause: 'paused',
      resume: 'running',
      hide: 'hidden',
      show: 'running',
      shutdown: 'disabled',
      'shut down': 'disabled',
      disable: 'disabled',
      quit: 'disabled',
    } as const;
    return { kind: 'lifecycle', value: values[lifecycle[1] as keyof typeof values] };
  }
  if (
    /^(?:stop following(?: my cursor)?|(?:turn|switch) (?:cursor )?following off|do not follow(?: my cursor)?)$/u.test(
      lower,
    )
  ) {
    return { kind: 'preference', key: 'following', value: false };
  }
  if (/^(?:follow(?: my cursor)?|(?:turn|switch) (?:cursor )?following on)$/u.test(lower)) {
    return { kind: 'preference', key: 'following', value: true };
  }
  if (/^(?:start wandering|wander|turn wandering on)$/u.test(lower)) {
    return { kind: 'preference', key: 'wandering', value: true };
  }
  if (/^(?:stop wandering|turn wandering off)$/u.test(lower)) {
    return { kind: 'preference', key: 'wandering', value: false };
  }
  if (/^(?:pause|stop)(?: the)? music$/u.test(lower)) return { kind: 'music', action: 'pause' };
  if (/^(?:resume|play)(?: the)? music$/u.test(lower)) return { kind: 'music', action: 'resume' };
  if (/^(?:next|skip)(?: track| song)?$/u.test(lower)) return { kind: 'music', action: 'next' };
  if (/^(?:previous|last)(?: track| song)?$/u.test(lower))
    return { kind: 'music', action: 'previous' };
  if (/^(?:loop(?: this track| this song| on)?|turn loop on)$/u.test(lower))
    return { kind: 'music', action: 'loop', value: true };
  if (/^(?:turn loop off|loop off|stop looping)$/u.test(lower))
    return { kind: 'music', action: 'loop', value: false };
  const volume = /^(?:set )?volume(?: to)? (\d{1,3})(?:\s*%)?$/u.exec(lower);
  if (volume) {
    const value = Number(volume[1]);
    return value <= 100
      ? { kind: 'music', action: 'volume', value }
      : clarify('Choose a volume from 0 to 100.');
  }
  const seek = /^seek(?: to)? (\d{1,5})(?: seconds?)?$/u.exec(lower);
  if (seek) return { kind: 'music', action: 'seek', value: Number(seek[1]) };
  const googleWorkflow = parseGoogleWorkflow(text, now);
  if (googleWorkflow) return googleWorkflow;
  const youtube = /^(?:search youtube for|open youtube and search for)\s+(.+)$/iu.exec(text);
  if (youtube?.[1]) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(youtube[1])}`;
    return { kind: 'navigate', url, label: `Search YouTube for ${youtube[1]}` };
  }
  const play = /^play(?:\s+(.+))?$/iu.exec(text);
  if (play) {
    if (!play[1]) return clarify('Which song would you like to find on YouTube?');
    if (/\sby$/iu.test(play[1])) return clarify('Which artist do you mean?');
    const parts = /^(.+?)\s+by\s+(.+)$/iu.exec(play[1]);
    const title = parts?.[1] ?? play[1];
    const artist = parts?.[2];
    return {
      kind: 'navigate',
      url: youtubeSearch(title, artist),
      label: `Search YouTube for ${title}${artist ? ` by ${artist}` : ''}`,
    };
  }
  const open = /^(?:open|go to)(?:\s+(.+))?$/iu.exec(text);
  if (open) {
    if (!open[1]) return clarify('Which website should I open?');
    const destination = open[1].trim();
    const key = destination.toLowerCase();
    const shortcut = Object.hasOwn(shortcuts, key) ? shortcuts[key] : undefined;
    const explicit = safeUrl(destination);
    const url = shortcut ? safeUrl(shortcut) : explicit;
    if (!url)
      return clarify(
        `I do not recognize "${destination}". Use a full https:// URL or add a website shortcut in Settings.`,
      );
    return { kind: 'navigate', url, label: `Open ${new URL(url).host}` };
  }
  const pageReminder = new RegExp(
    `^(?:remind me about|remind me to (?:read|revisit)) this (?:page|tab) in (\\d+(?:\\.\\d+)?)\\s*${reminderUnits}$`,
    'iu',
  ).exec(text);
  if (pageReminder) {
    const reminder = parseCommand(
      `remind me in ${pageReminder[1]} ${pageReminder[2]} to Revisit this page`,
      now,
      shortcuts,
    );
    return reminder.kind === 'reminder'
      ? { kind: 'page-reminder', dueAt: reminder.dueAt, title: reminder.title }
      : reminder;
  }
  const relative = new RegExp(
    `^remind me in (\\d+(?:\\.\\d+)?)\\s*${reminderUnits}(?: to (.+))?$`,
    'iu',
  ).exec(text);
  const about = new RegExp(
    `^remind me (?:about|to) (.+?) in (\\d+(?:\\.\\d+)?)\\s*${reminderUnits}$`,
    'iu',
  ).exec(text);
  if (relative || about) {
    const amount = Number(relative?.[1] ?? about?.[2]);
    const rawUnit = (relative?.[2] ?? about?.[3] ?? '').toLowerCase();
    const unit = rawUnit.length > 1 ? rawUnit.replace(/s$/u, '') : rawUnit;
    const title = (relative?.[3] ?? about?.[1] ?? '').trim();
    const factors: Record<string, number> = {
      s: 1000,
      sec: 1000,
      second: 1000,
      m: 60000,
      min: 60000,
      minute: 60_000,
      h: 3600000,
      hr: 3600000,
      hour: 3_600_000,
      d: 86400000,
      day: 86_400_000,
      w: 604800000,
      wk: 604800000,
      week: 604_800_000,
    };
    const duration = amount * (factors[unit] ?? 0);
    if (!title) return clarify('What should I remind you about?');
    if (!Number.isFinite(now) || duration < 1000 || duration > 315_576_000_000) {
      return clarify('Choose a reminder delay between 1 second and 10 years.');
    }
    return reminderIntent(title, Math.round(now + duration));
  }
  const tomorrow = /^remind me tomorrow at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?: to (.+))?$/iu.exec(
    text,
  );
  if (tomorrow) {
    let hour = Number(tomorrow[1]);
    const minute = Number(tomorrow[2] ?? 0);
    const meridian = tomorrow[3]?.toLowerCase();
    const title = tomorrow[4]?.trim();
    if (minute > 59 || (meridian ? hour < 1 || hour > 12 : hour > 23))
      return clarify('What time tomorrow? Use, for example, 9 AM or 14:30.');
    if (!title) return clarify('What should I remind you about tomorrow?');
    if (meridian) hour = (hour % 12) + (meridian === 'pm' ? 12 : 0);
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(hour, minute, 0, 0);
    if (!Number.isFinite(date.getTime())) return clarify('Choose a valid reminder time.');
    return reminderIntent(title, date.getTime());
  }
  const calendar =
    /^(?:show(?: me)?(?: my)? (?:next event|calendar|agenda|schedule)|what(?:'s| is) (?:on my calendar|my (?:agenda|schedule))|what (?:do i have|have i got|events do i have))(?: (?:for |on )?(today|tomorrow|this week))?$/u.exec(
      lower,
    );
  if (calendar)
    return {
      kind: 'calendar',
      message: 'Show a private read-only Calendar summary.',
      window:
        calendar[1] === 'tomorrow'
          ? 'tomorrow'
          : calendar[1] === 'this week'
            ? 'week'
            : calendar[1] === 'today'
              ? 'today'
              : 'next',
    };
  if (
    /^(?:check (?:my )?(?:email|gmail|mail|inbox)|tell me if i get a new email|(?:any|do i have) new (?:mail|emails?|messages?)|how many unread (?:emails?|messages?)(?: do i have)?|show(?: my)? unread count)$/u.test(
      lower,
    )
  )
    return { kind: 'email', message: 'Show the connected inbox unread count.' };
  if (lower.startsWith('remind me'))
    return clarify(
      'When and what should I remind you about? Try "remind me in 10 minutes to stretch".',
    );
  return clarify('I did not recognize that command. Type "help" to see supported commands.');
}
