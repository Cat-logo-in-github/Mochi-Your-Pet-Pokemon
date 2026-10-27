import { isMediaResult } from '@mochi/shared';
import type { MediaCommand, MediaResult, MediaState } from '@mochi/shared';
interface Probe {
  tabId: number;
  reports: { frameId: number; state: MediaState }[];
}
const probes = new Map<string, Probe>();
let lastTarget: { tabId: number; frameId: number } | undefined;
export function acceptMediaReport(raw: unknown, sender: chrome.runtime.MessageSender): boolean {
  if (
    !raw ||
    typeof raw !== 'object' ||
    sender.id !== chrome.runtime.id ||
    sender.tab?.id === undefined ||
    sender.frameId === undefined
  )
    return false;
  const value = raw as Record<string, unknown>;
  if (value.type !== 'media-report' || typeof value.requestId !== 'string') return false;
  const probe = probes.get(value.requestId);
  if (
    !probe ||
    probe.tabId !== sender.tab.id ||
    !isMediaResult({ ok: true, state: value.state, message: '' })
  )
    return false;
  try {
    if (!['http:', 'https:'].includes(new URL(sender.url || '').protocol)) return false;
  } catch {
    return false;
  }
  if (!probe.reports.some((r) => r.frameId === sender.frameId) && probe.reports.length < 30)
    probe.reports.push({ frameId: sender.frameId, state: value.state as MediaState });
  return true;
}
async function probeTab(tabId: number): Promise<Probe['reports']> {
  const requestId = crypto.randomUUID(),
    probe: Probe = { tabId, reports: [] };
  probes.set(requestId, probe);
  try {
    await chrome.tabs
      .sendMessage(tabId, { type: 'mochi-media-probe', requestId })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 180));
    return probe.reports;
  } finally {
    probes.delete(requestId);
  }
}
export async function dispatchMediaCommand(command: MediaCommand): Promise<MediaResult> {
  const audible = await chrome.tabs.query({ audible: true }),
    active = await chrome.tabs.query({ active: true, currentWindow: true });
  const candidates = [
    lastTarget?.tabId,
    ...active.map((t) => t.id),
    ...audible.map((t) => t.id),
  ].filter((id): id is number => id !== undefined);
  // Paused players lose their audible flag. At most twelve other tabs are probed on explicit requests.
  const rest = await chrome.tabs.query({});
  candidates.push(
    ...rest
      .slice(0, 12)
      .map((t) => t.id)
      .filter((id): id is number => id !== undefined),
  );
  for (const tabId of [...new Set(candidates)].slice(0, 16)) {
    const reports = await probeTab(tabId);
    reports.sort(
      (a, b) =>
        Number(a.state.paused) - Number(b.state.paused) ||
        Number(b.frameId === lastTarget?.frameId) - Number(a.frameId === lastTarget?.frameId),
    );
    const target = reports[0];
    if (!target) continue;
    if (command.action === 'status') {
      lastTarget = { tabId, frameId: target.frameId };
      return { ok: true, state: target.state, message: 'Player found.' };
    }
    try {
      const response: unknown = await chrome.tabs.sendMessage(
        tabId,
        { type: 'mochi-media-control', command },
        { frameId: target.frameId },
      );
      if (isMediaResult(response)) {
        if (response.ok) lastTarget = { tabId, frameId: target.frameId };
        return response;
      }
    } catch {
      /* Closed or protected frame: try another eligible player. */
    }
  }
  return {
    ok: false,
    error:
      'No controllable audio or video was found. Open a player tab and click its Play button once, then retry.',
  };
}
