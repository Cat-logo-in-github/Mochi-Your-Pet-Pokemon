// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Connections } from '../apps/extension/src/ui/Connections';
import { googleDefaults, normalizeGoogleConfig, publicGoogle } from '../apps/extension/src/google';
import type { Message } from '../apps/extension/src/protocol';
beforeEach(() =>
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ oauth2: { client_id: 'personal.apps.googleusercontent.com' } }),
    },
  }),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('visible Google monitoring and reminder coverage', () => {
  it('shows the current default and an honest30-day saved-schedule summary', () => {
    const google = googleDefaults();
    google.calendar.connected = true;
    google.calendar.scheduledCount = 3;
    google.calendar.horizonEnd = Date.now() + 30 * 86400000;
    google.calendar.nextReminderAt = Date.now() + 60000;
    render(<Connections google={google} send={vi.fn(async () => true)} notice={vi.fn()} />);
    expect(
      (screen.getByRole('combobox', { name: 'Gmail notification mode' }) as HTMLSelectElement)
        .value,
    ).toBe('all');
    expect(screen.getByLabelText('Calendar reminder coverage').textContent).toContain('3 active');
    expect(screen.getByLabelText('Calendar reminder coverage').textContent).toContain('30 days');
    expect(screen.getByLabelText('Calendar reminder coverage').textContent).toContain(
      'Next reminder',
    );
    expect(
      (screen.getByRole('combobox', { name: 'All-day reminder hour' }) as HTMLSelectElement).value,
    ).toBe('9');
    expect(
      (screen.getByRole('checkbox', { name: /All-day event reminders/u }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
  it('explains a legacy Important filter and lets the user explicitly enable ordinary new mail', () => {
    const google = googleDefaults();
    google.config = normalizeGoogleConfig({ gmailMode: 'important' });
    const send = vi.fn(async (_message: Message) => true);
    render(<Connections google={google} send={send} notice={vi.fn()} />);
    expect(screen.getByText('Review your saved mail filter')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable all new inbox mail' }));
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'google-config',
      patch: { gmailMode: 'all', notificationPreferencesVersion: 1 },
    });
  });
  it('shows the actual suppression reason and exposes the real inbox+OS test route', () => {
    const google = googleDefaults();
    google.gmail.connected = true;
    google.gmail.check = {
      checkedAt: Date.now(),
      baselineReady: true,
      examined: 1,
      eligible: 1,
      queued: 1,
      filtered: 0,
      waitingForInbox: 0,
      duplicates: 0,
      pending: 0,
      reason: 'quiet-hours',
    };
    const send = vi.fn(async (_message: Message) => true);
    render(<Connections google={google} send={send} notice={vi.fn()} />);
    expect(screen.getByLabelText('Last Gmail check result').textContent).toContain('quiet hours');
    expect(screen.getByLabelText('Last Gmail check result').textContent).toContain('saved 1');
    fireEvent.click(screen.getByRole('button', { name: 'Test system notification + Mochi inbox' }));
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'notification-test' });
  });
  it('labels paused monitoring instead of promising the next automatic check', () => {
    const state = googleDefaults();
    state.gmail.connected = true;
    const google = publicGoogle(state, 'paused');
    render(<Connections google={google} send={vi.fn(async () => true)} notice={vi.fn()} />);
    expect(screen.getAllByText('Automatic monitoring is paused.')).toHaveLength(2);
    expect(screen.queryByText(/Expected next check:/u)).toBeNull();
  });
});
