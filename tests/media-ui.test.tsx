// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createDefaultData, type MediaState } from '@mochi/shared';
import { request } from '../apps/extension/src/client';
import type { Response } from '../apps/extension/src/protocol';
import { TabMediaControls } from '../apps/extension/src/ui/TabMediaControls';

vi.mock('../apps/extension/src/client', () => ({ request: vi.fn() }));
const send = vi.mocked(request);
const player = (patch: Partial<MediaState> = {}): MediaState => ({
  title: 'A real browser song',
  paused: true,
  currentTime: 63,
  duration: 240,
  volume: 35,
  loop: false,
  canSeek: true,
  canNext: true,
  canPrevious: false,
  ...patch,
});
const response = (state: MediaState): Response => ({
  ok: true,
  data: createDefaultData(),
  google: {
    configured: false,
    platformSupported: true,
    calendar: { connected: false, items: [] },
    gmail: { connected: false, unread: 0 },
    config: {
      calendarIds: ['primary'],
      offsetMinutes: 10,
      allDayReminders: false,
      allDayHour: 9,
      eventTypes: ['default'],
      gmailSenders: [],
      gmailMuted: false,
      gmailMode: 'important',
    },
  },
  media: { ok: true, state, message: 'Player connected.' },
});
beforeEach(() => send.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function connect(state = player()) {
  send.mockResolvedValueOnce(response(state));
  render(<TabMediaControls />);
  fireEvent.click(screen.getByRole('button', { name: 'Find player' }));
  await screen.findByText(state.title);
}

describe('real browser player presentation', () => {
  it('stays unconnected without a user request and respects reported transport capabilities', async () => {
    const { unmount } = render(<TabMediaControls />);
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Not connected yet')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Play or pause current tab' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect((screen.getByRole('slider', { name: 'Tab volume' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    unmount();
    await connect();
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'media', command: { action: 'status' } });
    expect(screen.getByText('1:03')).toBeTruthy();
    expect(screen.getByText('4:00')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Previous tab track' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Next tab track' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    send.mockResolvedValueOnce(response(player({ paused: false })));
    fireEvent.click(screen.getByRole('button', { name: 'Play tab audio' }));
    await screen.findByRole('button', { name: 'Pause tab audio' });
    expect(send).toHaveBeenLastCalledWith({ type: 'media', command: { action: 'toggle' } });
    expect(screen.getByText('Playing')).toBeTruthy();
  });

  it('commits keyboard range changes and restores the last audible volume after mute', async () => {
    await connect();
    const volume = screen.getByRole('slider', { name: 'Tab volume' });
    fireEvent.change(volume, { target: { value: '62' } });
    fireEvent.keyUp(volume, { key: 'Tab' });
    expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce(response(player({ volume: 62 })));
    fireEvent.keyUp(volume, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByLabelText('Tab volume value').textContent).toBe('62%'));
    expect(send).toHaveBeenLastCalledWith({
      type: 'media',
      command: { action: 'volume', value: 62 },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Mute tab audio' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    send.mockResolvedValueOnce(response(player({ volume: 0 })));
    fireEvent.click(screen.getByRole('button', { name: 'Mute tab audio' }));
    await screen.findByRole('button', { name: 'Unmute tab audio' });
    expect(send).toHaveBeenLastCalledWith({
      type: 'media',
      command: { action: 'volume', value: 0 },
    });
    send.mockResolvedValueOnce(response(player({ volume: 62 })));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute tab audio' }));
    await screen.findByRole('button', { name: 'Mute tab audio' });
    expect(send).toHaveBeenLastCalledWith({
      type: 'media',
      command: { action: 'volume', value: 62 },
    });
    const seek = screen.getByRole('slider', { name: 'Tab playback position' });
    fireEvent.change(seek, { target: { value: '90' } });
    send.mockResolvedValueOnce(response(player({ currentTime: 90, volume: 62 })));
    fireEvent.keyUp(seek, { key: 'End' });
    await waitFor(() =>
      expect(send).toHaveBeenLastCalledWith({
        type: 'media',
        command: { action: 'seek', value: 90 },
      }),
    );
  });

  it('serializes pending controls and exposes a real connection error without inventing playback', async () => {
    let finish!: (result: Response) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<TabMediaControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Find player' }));
    expect(
      screen.getByRole('region', { name: 'Browser tab playback' }).getAttribute('aria-busy'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Find player' }));
    expect(send).toHaveBeenCalledTimes(1);
    finish(response(player()));
    await screen.findByText('A real browser song');
    send.mockResolvedValueOnce({ ok: false, error: 'This protected player refused control.' });
    fireEvent.click(screen.getByRole('button', { name: 'Play tab audio' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'protected player refused control',
    );
    expect(screen.getByRole('button', { name: 'Play tab audio' })).toBeTruthy();
    expect(screen.queryByText('Playing')).toBeNull();
    expect(screen.getByText('Needs a refresh')).toBeTruthy();
  });

  it('leaves seek unavailable for a live or unknown-duration player', async () => {
    await connect(player({ duration: null, currentTime: 0, canSeek: false, canNext: false }));
    expect(screen.getByText('Live / unknown')).toBeTruthy();
    expect(
      (screen.getByRole('slider', { name: 'Tab playback position' }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Next tab track' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
