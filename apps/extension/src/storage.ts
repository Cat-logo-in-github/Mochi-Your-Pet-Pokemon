import { contentData } from './protocol';
import { createDefaultData, normalizeData } from '@mochi/shared';
import type { AppData } from '@mochi/shared';
export const DATA_KEY = 'mochi';
export async function readData(): Promise<AppData> {
  const value = await chrome.storage.local.get(DATA_KEY);
  return value[DATA_KEY] ? normalizeData(value[DATA_KEY]) : createDefaultData();
}
export async function writeData(data: AppData): Promise<void> {
  data = normalizeData(data);
  await chrome.storage.local.set({ [DATA_KEY]: data });
  // Content scripts receive only pet/reminder state, never Google account caches.
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? Promise.resolve()
        : chrome.tabs
            .sendMessage(tab.id, { type: 'mochi-state', data: contentData(data) })
            .catch(() => undefined),
    ),
  );
}
export function addDiagnostic(data: AppData, message: string): void {
  data.diagnostics = [
    { at: Date.now(), message: message.slice(0, 220) },
    ...data.diagnostics,
  ].slice(0, 30);
}
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => undefined);
  return result;
}
