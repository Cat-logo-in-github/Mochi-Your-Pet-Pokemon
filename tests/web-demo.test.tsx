// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DemoWorkspace } from '../apps/web/src/DemoWorkspace';

vi.mock('../apps/extension/src/ui/Pet', () => ({
  Pet: () => <span aria-hidden="true">sprite</span>,
}));
const notices: MockNotification[] = [];
class MockNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    MockNotification.permission = 'granted';
    return 'granted';
  });
  onclose: (() => void) | null = null;
  onclick: (() => void) | null = null;
  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {
    notices.push(this);
  }
  close() {
    this.onclose?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2035-04-01T10:00:00Z'));
  notices.length = 0;
  MockNotification.permission = 'granted';
  MockNotification.requestPermission.mockClear();
  vi.stubGlobal('Notification', MockNotification);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('website companion demo', () => {
  it('returns a hidden companion for a due reminder and keeps it available after snoozing', async () => {
    render(<DemoWorkspace skin="eevee" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: 'Pet Eevee' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remind me in 5 seconds' }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole('button', { name: 'Pet Eevee' })).toBeTruthy();
    const dialog = screen.getByRole('region', { name: 'Mochi reminder' });
    expect(within(dialog).getByText('Take a little stretch break.')).toBeTruthy();
    expect(notices).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Snooze 5 min' }));
    expect(screen.queryByRole('region', { name: 'Mochi reminder' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Pending demo reminders' })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    expect(screen.getByRole('region', { name: 'Mochi reminder' })).toBeTruthy();
    expect(notices).toHaveLength(2);
  });

  it('shows a blocked timed-link fallback and preserves its URL on snooze without reopening it', async () => {
    render(<DemoWorkspace skin="eevee" />);
    fireEvent.change(screen.getByLabelText('Ask Mochi something'), {
      target: { value: 'remind me in 5 sec to check https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run demo command' }));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    const dialog = screen.getByRole('region', { name: 'Mochi reminder' });
    expect(within(dialog).getByText(/browser blocked the timed tab/)).toBeTruthy();
    expect(
      within(dialog).getByRole('link', { name: 'Open saved link ↗' }).getAttribute('href'),
    ).toBe('https://example.com/');
    expect(window.open).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Snooze 5 min' }));
    await act(() => vi.advanceTimersByTimeAsync(300_000));
    expect(
      within(screen.getByRole('region', { name: 'Mochi reminder' }))
        .getByRole('link', { name: 'Open saved link ↗' })
        .getAttribute('href'),
    ).toBe('https://example.com/');
    expect(window.open).toHaveBeenCalledTimes(1);
  });

  it('operates its own audio element while preserving the default follow frequency', async () => {
    const { container } = render(<DemoWorkspace skin="eevee" />);
    const audio = container.querySelector('audio')!;
    expect(
      (screen.getByLabelText('How often should Mochi follow?') as HTMLSelectElement).value,
    ).toBe('sometimes');
    expect(
      (screen.getByLabelText('Follow my cursor inside this preview') as HTMLInputElement).checked,
    ).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '▶ Play demo' })));
    expect(audio.play).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Demo volume'), { target: { value: '35' } });
    expect(audio.volume).toBe(0.35);
    fireEvent.click(screen.getByLabelText('Loop this track'));
    expect(audio.loop).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ⅱ Pause demo' }));
    expect(audio.pause).toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next demo track' })));
    expect(screen.getByText('Little afternoon')).toBeTruthy();
    expect(audio.src).toContain('little-afternoon');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('requests OS notification permission only after the explicit enable action', async () => {
    MockNotification.permission = 'default';
    render(<DemoWorkspace skin="eevee" />);
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' })),
    );
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Test notification' }));
    expect(notices).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Mochi reminder' })).toBeTruthy();
  });
});
