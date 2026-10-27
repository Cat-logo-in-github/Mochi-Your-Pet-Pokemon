// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, PET_SKINS, PET_SKIN_LABELS, type Reminder } from '@mochi/shared';
import { CommandBox } from '../apps/extension/src/ui/CommandBox';
import { Pet } from '../apps/extension/src/ui/Pet';
import { CompanionSettings } from '../apps/extension/src/ui/Preferences';
import { ReminderManager } from '../apps/extension/src/ui/ReminderManager';
import { MusicPlayer } from '../apps/extension/src/ui/MusicPlayer';
import type { Message } from '../apps/extension/src/protocol';

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://mochi-test/${path}` },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const makeReminder = (patch: Partial<Reminder> = {}): Reminder => ({
  id: 'ui-reminder',
  title: 'Stretch',
  dueAt: Date.parse('2035-01-10T09:00:00Z'),
  timeZone: 'UTC',
  recurrence: 'none',
  paused: false,
  completed: false,
  source: 'local',
  ...patch,
});

function fillReminder() {
  fireEvent.change(screen.getByLabelText('What should Mochi remember?'), {
    target: { value: 'Call Alex' },
  });
  fireEvent.change(screen.getByLabelText('Date & time'), { target: { value: '2035-01-10T09:00' } });
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Asia/Dubai' } });
}

describe('pet presentation', () => {
  it('provides decorative pixel sprites without an extra keyboard stop', () => {
    const { container, rerender } = render(<Pet mood="happy" skin="leafeon" size={100} />);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.skin).toBe('leafeon');
    expect(art.classList.contains('mood-happy')).toBe(true);
    expect(art.style.width).toBe('100px');
    expect(art.style.imageRendering).toBe('pixelated');
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.querySelector('button,input,a,[tabindex]')).toBeNull();
    rerender(<Pet mood="sleeping" paused />);
    expect(art.classList.contains('is-paused')).toBe(true);
    expect(art.classList.contains('mood-sleeping')).toBe(true);
  });
});

describe('companion appearance', () => {
  it('offers Eevee and all eight evolutions as named static previews', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    const patch = vi.fn(async () => true);
    const { container } = render(<CompanionSettings s={DEFAULT_SETTINGS} patch={patch} />);
    const picker = container.querySelector('.skin-picker') as HTMLElement;
    expect(within(picker).getAllByRole('button')).toHaveLength(9);
    for (const skin of PET_SKINS) {
      const button = within(picker).getByRole('button', {
        name: PET_SKIN_LABELS[skin],
      });
      expect(button.querySelector('.is-paused')).not.toBeNull();
      expect(button.getAttribute('aria-pressed')).toBe(String(skin === 'eevee'));
    }
    fireEvent.click(within(picker).getByRole('button', { name: 'Umbreon' }));
    expect(patch).toHaveBeenCalledExactlyOnceWith({ skin: 'umbreon' });
  });
});

describe('accessible command input', () => {
  it('previews a destination before invoking the user command once', async () => {
    const run = vi.fn(async (_text: string) => true);
    render(<CommandBox run={run} shortcuts={DEFAULT_SETTINGS.shortcuts} />);
    const input = screen.getByRole('textbox', {
      name: 'A little help, one command away',
    }) as HTMLInputElement;
    const submit = screen.getByRole('button', { name: 'Run command' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'open GitHub' } });
    expect(screen.getByText(/Open github.com.*github.com/u)).toBeTruthy();
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => expect(input.value).toBe(''));
    expect(run).toHaveBeenCalledExactlyOnceWith('open GitHub');
  });

  it('preserves a failed command so the user can correct it', async () => {
    const run = vi.fn(async (_text: string) => false);
    render(<CommandBox run={run} shortcuts={{}} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'open unknown destination' } });
    expect(screen.getByText(/I do not recognize/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('open unknown destination');
  });

  it('coalesces repeated submit gestures while a command is pending', async () => {
    let resolve!: (value: boolean) => void;
    const pending = new Promise<boolean>((done) => {
      resolve = done;
    });
    const run = vi.fn((_text: string) => pending);
    render(<CommandBox run={run} shortcuts={DEFAULT_SETTINGS.shortcuts} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'play Mercy' } });
    const submit = screen.getByRole('button', { name: 'Run command' }) as HTMLButtonElement;
    fireEvent.click(submit);
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(run).toHaveBeenCalledTimes(1);
    resolve(true);
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(''));
  });
});

describe('reminder management', () => {
  it('creates a recurring reminder with an explicit IANA timezone', async () => {
    const send = vi.fn(async (_message: Message) => true);
    render(<ReminderManager reminders={[]} catchUp={[]} send={send} />);
    fillReminder();
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'daily' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'reminder-save',
      reminder: {
        title: 'Call Alex',
        dueAt: Date.parse('2035-01-10T05:00:00Z'),
        timeZone: 'Asia/Dubai',
        recurrence: 'daily',
        paused: false,
        completed: false,
        source: 'local',
      },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('What should Mochi remember?') as HTMLInputElement).value).toBe(
        '',
      ),
    );
  });

  it('clears old occurrence claims and wall-clock anchors when editing a schedule', async () => {
    const send = vi.fn(async (_message: Message) => true);
    const entry = makeReminder({
      recurrence: 'daily',
      recurrenceTime: '02:30:00',
      lastDeliveredAt: 1000,
    });
    render(<ReminderManager reminders={[entry]} catchUp={[]} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Date & time'), {
      target: { value: '2035-01-11T11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const message = send.mock.calls[0]?.[0];
    if (message?.type !== 'reminder-save') throw new Error('Expected reminder-save');
    expect(message.reminder.id).toBe(entry.id);
    expect(message.reminder.dueAt).toBe(Date.parse('2035-01-11T11:00:00Z'));
    expect(message.reminder).not.toHaveProperty('lastDeliveredAt');
    expect(message.reminder).not.toHaveProperty('recurrenceTime');
  });

  it('shows an understandable error and keeps data when timezone validation fails', async () => {
    const send = vi.fn(async (_message: Message) => true);
    render(<ReminderManager reminders={[]} catchUp={[]} send={send} />);
    fillReminder();
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Broken/Timezone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    expect((screen.getByLabelText('What should Mochi remember?') as HTMLInputElement).value).toBe(
      'Call Alex',
    );
  });

  it('routes snooze, dismiss, recurrence pause, and accessible delete controls', () => {
    const send = vi.fn(async (_message: Message) => true);
    render(
      <ReminderManager
        reminders={[makeReminder({ recurrence: 'weekly' })]}
        catchUp={[]}
        send={send}
      />,
    );
    const row = screen.getByText('Stretch').closest('article')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Snooze 10m' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Pause' }));
    fireEvent.click(within(row).getByRole('button', { name: 'Delete reminder Stretch' }));
    expect(send.mock.calls.map(([message]) => message)).toEqual([
      { type: 'reminder-action', id: 'ui-reminder', action: 'snooze', minutes: 10 },
      { type: 'reminder-action', id: 'ui-reminder', action: 'dismiss' },
      { type: 'reminder-action', id: 'ui-reminder', action: 'toggle' },
      { type: 'reminder-delete', id: 'ui-reminder' },
    ]);
  });

  it('keeps synced calendar definitions read-only while allowing dismissal and snooze', () => {
    const send = vi.fn(async (_message: Message) => true);
    render(
      <ReminderManager
        reminders={[makeReminder({ source: 'calendar' })]}
        catchUp={[]}
        send={send}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Snooze 10m' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('offers catch-up reminders with real snooze and dismiss actions', () => {
    const send = vi.fn(async (_message: Message) => true);
    render(<ReminderManager reminders={[]} catchUp={[makeReminder()]} send={send} />);
    expect(screen.getByText('While you were away')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Snooze 10m' }));
    expect(send).toHaveBeenCalledWith({
      type: 'reminder-action',
      id: 'ui-reminder',
      action: 'snooze',
      minutes: 10,
    });
  });
});

describe('honest music capabilities and functional local controls', () => {
  it('controls the included original tracks, volume, seek, and looping', async () => {
    let paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = false;
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = true;
      this.dispatchEvent(new Event('pause'));
    });
    const { container } = render(
      <MusicPlayer lastUrl="https://www.youtube.com/results?search_query=Mercy" />,
    );
    const audio = container.querySelector('audio')!;
    expect(audio.preload).toBe('none');
    expect(container.querySelector('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('Original demo tracks'));
    expect(screen.getByText('Cloud Garden')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Browser tab playback' })).toBeTruthy();
    const link = screen.getByRole('link', {
      name: /Open last YouTube search/u,
    }) as HTMLAnchorElement;
    expect(link.href).toContain('https://www.youtube.com/results');
    fireEvent.click(screen.getByRole('button', { name: 'Play demo music' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Pause demo music' })).toBeTruthy(),
    );
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pause demo music' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play demo music' })).toBeTruthy(),
    );
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Demo volume' }), {
      target: { value: '17' },
    });
    expect(audio.volume).toBe(0.17);
    fireEvent.click(screen.getByRole('button', { name: 'Mute demo audio' }));
    expect(audio.volume).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute demo audio' }));
    expect(audio.volume).toBe(0.17);
    Object.defineProperty(audio, 'duration', { configurable: true, value: 120 });
    fireEvent.loadedMetadata(audio);
    fireEvent.change(screen.getByRole('slider', { name: 'Seek demo music' }), {
      target: { value: '30' },
    });
    expect(audio.currentTime).toBe(30);
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
    expect(audio.loop).toBe(true);
    expect(screen.getByRole('button', { name: 'Loop' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next demo track' }));
    expect(screen.getByText('Little Afternoon')).toBeTruthy();
    expect(audio.src).toContain('little-afternoon.wav');
    fireEvent.click(screen.getByRole('button', { name: 'Previous demo track' }));
    expect(screen.getByText('Cloud Garden')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play demo music' }));
    await waitFor(() => expect(paused).toBe(false));
    fireEvent.click(screen.getByText('Original demo tracks'));
    await waitFor(() => expect(paused).toBe(true));
  });

  it('reports playback policy or device failures without pretending music started', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
      new Error('NotAllowedError'),
    );
    render(<MusicPlayer />);
    fireEvent.click(screen.getByText('Original demo tracks'));
    fireEvent.click(screen.getByRole('button', { name: 'Play demo music' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Playback needs a click');
    expect(screen.queryByRole('button', { name: 'Pause demo music' })).toBeNull();
  });
});

describe('explicit local reminder link preferences', () => {
  it('saves a linked page only with a clearly selected automatic-opening option', async () => {
    const send = vi.fn(async (_message: Message) => true);
    render(<ReminderManager reminders={[]} catchUp={[]} send={send} />);
    fillReminder();
    fireEvent.change(screen.getByLabelText('Linked page (optional)'), {
      target: { value: 'https://example.com/article' },
    });
    const optin = screen.getByRole('checkbox', { name: /Open this page automatically when due/u });
    expect((optin as HTMLInputElement).checked).toBe(false);
    fireEvent.click(optin);
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'reminder-save',
      reminder: { url: 'https://example.com/article', openUrlOnDue: true, source: 'local' },
    });
  });
  it('refuses automatic opening when no safe link was supplied', async () => {
    const send = vi.fn(async (_message: Message) => true);
    render(<ReminderManager reminders={[]} catchUp={[]} send={send} />);
    fillReminder();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Open this page automatically when due/u }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Add a safe linked page before enabling automatic opening.',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('reviewed Google web workflows', () => {
  it('requires a review click before opening a draft, without using the normal command path', async () => {
    const run = vi.fn(async () => true),
      confirm = vi.fn(async () => true);
    render(<CommandBox run={run} confirmGoogle={confirm} shortcuts={DEFAULT_SETTINGS.shortcuts} />);
    const input = screen.getByRole('textbox', { name: 'A little help, one command away' });
    const text = 'draft email to reader@example.invalid subject Hello';
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }));
    expect(run).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Review Google action' })).toBeTruthy();
    expect(screen.getByText(/Mochi never sends/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Gmail draft' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledExactlyOnceWith(text));
  });
});
