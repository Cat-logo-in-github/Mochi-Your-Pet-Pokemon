import { describe, expect, it } from 'vitest';
import { parseCommand, normalizeData } from '@mochi/shared';
const now = Date.parse('2030-01-15T08:00:00Z');
describe('private read-only Google workflow language', () => {
  it.each([
    "what's on my calendar today",
    'show my agenda for tomorrow',
    'what do I have this week',
    'show my next event',
  ])('recognizes agenda variation %s', (text) =>
    expect(parseCommand(text, now).kind).toBe('calendar'),
  );
  it.each([
    'check my inbox',
    'any new mail',
    'do I have new emails',
    'how many unread messages do I have',
    'check Gmail',
  ])('recognizes unread-count variation %s', (text) =>
    expect(parseCommand(text, now).kind).toBe('email'),
  );
  it.each([
    'search Gmail for invoices & receipts',
    'find emails about project notes',
    'show emails from reader@example.invalid',
  ])('encodes Gmail searches only into Google web URLs: %s', (text) => {
    const intent = parseCommand(text, now);
    if (intent.kind !== 'google-workflow') throw new Error('Expected workflow plan');
    expect(intent.plan.action).toBe('search-mail');
    expect(new URL(intent.plan.url).origin).toBe('https://mail.google.com');
    expect(intent.plan.description).toContain('does not read');
  });
  it('prefills an editable draft without sending or changing mail', () => {
    const intent = parseCommand(
      'draft email to reader@example.invalid subject Hello & goodbye body A short note',
      now,
    );
    if (intent.kind !== 'google-workflow') throw new Error('Expected draft plan');
    const url = new URL(intent.plan.url);
    expect(url.searchParams.get('to')).toBe('reader@example.invalid');
    expect(url.searchParams.get('su')).toBe('Hello & goodbye');
    expect(url.searchParams.get('body')).toBe('A short note');
    expect(intent.plan.description).toContain('never sends');
    expect(parseCommand('send an email to Alex', now).kind).toBe('clarify');
  });
  it('opens a future event editor plan with a bounded duration and no API write', () => {
    const intent = parseCommand('schedule event Planning tomorrow at 9 AM for 30 min', now);
    if (intent.kind !== 'google-workflow') throw new Error('Expected event plan');
    const url = new URL(intent.plan.url);
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Planning');
    expect(url.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/u);
    expect(intent.plan.description).toContain('save it yourself');
    expect(parseCommand('schedule event Invalid on 2030-02-30 at 9 AM', now).kind).toBe('clarify');
  });
  it('keeps private Google search/draft URLs out of migrated command history', () => {
    const data = normalizeData({
      history: [
        {
          id: 'private',
          command: 'private draft',
          url: 'https://mail.google.com/mail/?view=cm&to=reader@example.invalid',
          at: now,
        },
        { id: 'normal', command: 'open example', url: 'https://example.com/', at: now },
      ],
    });
    expect(data.history.map((h) => h.id)).toEqual(['normal']);
  });
});
