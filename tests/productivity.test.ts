// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isMediaCommand, normalizeSettings, parseCommand } from '@mochi/shared';
import { controlPageMedia, readMediaState } from '../apps/extension/src/mediaBridge';
let player: HTMLAudioElement;
let paused: boolean;
beforeEach(() => {
  document.body.replaceChildren();
  document.title = 'Mochi test player';
  player = document.createElement('audio');
  document.body.append(player);
  paused = true;
  Object.defineProperty(player, 'paused', { configurable: true, get: () => paused });
  Object.defineProperty(player, 'duration', { configurable: true, value: 120 });
  vi.spyOn(player, 'play').mockImplementation(async () => {
    paused = false;
  });
  vi.spyOn(player, 'pause').mockImplementation(() => {
    paused = true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
describe('real page media transport', () => {
  it('confirms play and pause from the actual media element', async () => {
    expect((await controlPageMedia({ action: 'play' })).ok).toBe(true);
    expect(readMediaState()?.paused).toBe(false);
    expect((await controlPageMedia({ action: 'pause' })).ok).toBe(true);
    expect(readMediaState()?.paused).toBe(true);
  });
  it('reports autoplay refusal without claiming success', async () => {
    vi.mocked(player.play).mockRejectedValue(new Error('User gesture required'));
    expect(await controlPageMedia({ action: 'play' })).toEqual({
      ok: false,
      error: 'User gesture required',
    });
    expect(readMediaState()?.paused).toBe(true);
  });
  it('changes actual volume and clears mute when audible', async () => {
    player.muted = true;
    await controlPageMedia({ action: 'volume', value: 37 });
    expect(player.volume).toBe(0.37);
    expect(player.muted).toBe(false);
  });
  it('bounds seeking to actual duration and refuses live seeking', async () => {
    await controlPageMedia({ action: 'seek', value: 200 });
    expect(player.currentTime).toBe(120);
    Object.defineProperty(player, 'duration', { configurable: true, value: Infinity });
    expect((await controlPageMedia({ action: 'seek', value: 5 })).ok).toBe(false);
  });
  it('sets and toggles actual loop state', async () => {
    await controlPageMedia({ action: 'loop', value: true });
    expect(player.loop).toBe(true);
    await controlPageMedia({ action: 'loop' });
    expect(player.loop).toBe(false);
  });
  it('does not click arbitrary next buttons on unsupported sites', async () => {
    const button = document.createElement('button');
    button.className = 'ytp-next-button';
    const click = vi.fn();
    button.onclick = click;
    document.body.append(button);
    expect((await controlPageMedia({ action: 'next' })).ok).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('reports missing players and validates bounded media commands', async () => {
    player.remove();
    expect((await controlPageMedia({ action: 'status' })).ok).toBe(false);
    for (const value of [
      { action: 'volume', value: 101 },
      { action: 'seek', value: -1 },
      { action: 'play', value: 'script' },
      { action: 'eval' },
    ])
      expect(isMediaCommand(value)).toBe(false);
  });
});
describe('useful companion preferences and page reminders', () => {
  it('keeps the existing frequency as default and normalizes unknown values', () => {
    expect(normalizeSettings({}).followCursorFrequency).toBe('sometimes');
    expect(normalizeSettings({ followCursorFrequency: 'unknown' }).followCursorFrequency).toBe(
      'sometimes',
    );
    expect(normalizeSettings({ followCursorFrequency: 'off' }).followCursorFrequency).toBe('off');
  });
  it('recognizes saved-page reminders with a bounded due time', () => {
    expect(parseCommand('Remind me about this page in 30 minutes', 1000)).toEqual({
      kind: 'page-reminder',
      title: 'Revisit this page',
      dueAt: 1801000,
    });
    expect(parseCommand('remind me to revisit this tab in 0 seconds').kind).toBe('clarify');
    expect(parseCommand('remind me to read this page in 1 hour', 1000).kind).toBe('page-reminder');
  });
});
