import type { MusicProvider } from './types';

export function safeUrl(input: string): string | null {
  if (
    typeof input !== 'string' ||
    input.length > 2048 ||
    /[\s\\]/u.test(input) ||
    [...input].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    !/^https?:\/\//iu.test(input)
  ) {
    return null;
  }
  try {
    const url = new URL(input);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function youtubeSearch(query: string, artist?: string): string {
  const search = [query.trim(), artist?.trim(), 'full song'].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`;
}

export function isRestrictedUrl(input: string): boolean {
  const parsed = safeUrl(input);
  if (!parsed) return true;
  const url = new URL(parsed);
  return (
    url.hostname === 'chromewebstore.google.com' ||
    (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
    (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))
  );
}

export const youtubeProvider: MusicProvider = {
  id: 'youtube',
  name: 'YouTube (external playback)',
  capabilities: Object.freeze({
    canPause: false,
    canSeek: false,
    canLoop: false,
    canChangeTrack: false,
    canReadMetadata: false,
    canVolume: false,
  }),
  search: youtubeSearch,
};

export const demoCapabilities = Object.freeze({
  canPause: true,
  canSeek: true,
  canLoop: true,
  canChangeTrack: true,
  canReadMetadata: true,
  canVolume: true,
});

/** Google workflow URLs may contain private draft/search fields; never retain them as command history. */
export function isPrivateGoogleUrl(input: string): boolean {
  const safe = safeUrl(input);
  if (!safe) return false;
  const url = new URL(safe);
  return (
    ['mail.google.com', 'calendar.google.com', 'accounts.google.com'].includes(url.hostname) ||
    (url.hostname === 'www.google.com' && url.pathname.startsWith('/calendar'))
  );
}
