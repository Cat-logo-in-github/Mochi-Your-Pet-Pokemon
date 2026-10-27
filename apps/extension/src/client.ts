import type { AppData } from '@mochi/shared';
import type { Message, Response } from './protocol';
export type { Message, Response, GoogleStatus, GoogleConfig } from './protocol';
export async function request(message: Message): Promise<Response> {
  try {
    return (await chrome.runtime.sendMessage(message)) as Response;
  } catch {
    return {
      ok: false,
      error: 'Mochi was updated or is unavailable. Reload this page and try again.',
    };
  }
}
export function subscribe(
  callback: (data: AppData) => void,
  remindersChanged?: () => void,
): () => void {
  const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.mochi?.newValue) callback(changes.mochi.newValue as AppData);
    if (area === 'local' && changes['mochi-deliveries']) remindersChanged?.();
  };
  const messageListener = (message: unknown, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
    const event = message as { type?: unknown; data?: unknown };
    if (event.type === 'mochi-reminders-changed') remindersChanged?.();
    if (event.type === 'mochi-state' && event.data && typeof event.data === 'object')
      callback(event.data as AppData);
  };
  const ownedPage = globalThis.location?.protocol === 'chrome-extension:';
  if (ownedPage) chrome.storage.onChanged.addListener(storageListener);
  chrome.runtime.onMessage.addListener(messageListener);
  return () => {
    if (ownedPage) chrome.storage.onChanged.removeListener(storageListener);
    chrome.runtime.onMessage.removeListener(messageListener);
  };
}
