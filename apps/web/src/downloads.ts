export const DOWNLOAD_FILES = {
  windows: 'mochi-windows-companion.zip',
  browser: 'mochi-chrome-extension.zip',
  source: 'mochi-project.zip',
} as const;
export type DownloadKind = keyof typeof DOWNLOAD_FILES;
export interface DownloadAsset {
  file: string;
  sha256: string;
  bytes: number;
}
export interface DownloadManifest {
  version: string;
  assets: Partial<Record<DownloadKind, DownloadAsset>>;
}
export interface DownloadLink {
  href: string;
  bytes: number;
  sha256?: string;
  version?: string;
  origin: 'website' | 'release';
}
export interface DownloadState {
  status: 'loading' | 'ready' | 'unavailable';
  windows?: DownloadLink;
  browser?: DownloadLink;
  source?: DownloadLink;
  repository?: string;
  releasePage?: string;
  message: string;
}
export function normalizeRepository(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const name = value.trim();
  if (name.length > 140 || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/u.test(name))
    return;
  const repo = name.split('/')[1];
  return repo === '.' || repo === '..' ? undefined : name;
}
export function websiteDownloadUrl(base: string, name: string): string {
  if (!Object.values(DOWNLOAD_FILES).includes(name as (typeof DOWNLOAD_FILES)[DownloadKind]))
    throw new Error('Unknown Mochi download.');
  return `${base || './'}${base && !base.endsWith('/') ? '/' : ''}downloads/${name}`;
}
export function parseDownloadManifest(value: unknown): DownloadManifest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/u.test(raw.version) ||
    !raw.assets ||
    typeof raw.assets !== 'object' ||
    Array.isArray(raw.assets)
  )
    return;
  const assets: DownloadManifest['assets'] = {};
  for (const kind of Object.keys(DOWNLOAD_FILES) as DownloadKind[]) {
    const entry = (raw.assets as Record<string, unknown>)[kind];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (
      item.file === DOWNLOAD_FILES[kind] &&
      typeof item.sha256 === 'string' &&
      /^[a-fA-F0-9]{64}$/u.test(item.sha256) &&
      typeof item.bytes === 'number' &&
      Number.isSafeInteger(item.bytes) &&
      item.bytes > 0 &&
      item.bytes < 512 * 1024 * 1024
    )
      assets[kind] = {
        file: DOWNLOAD_FILES[kind],
        sha256: item.sha256.toLowerCase(),
        bytes: item.bytes,
      };
  }
  return { version: raw.version, assets };
}
export function linksFromManifest(
  base: string,
  manifest: DownloadManifest,
): Partial<Record<DownloadKind, DownloadLink>> {
  const result: Partial<Record<DownloadKind, DownloadLink>> = {};
  for (const kind of Object.keys(DOWNLOAD_FILES) as DownloadKind[]) {
    const item = manifest.assets[kind];
    if (item)
      result[kind] = {
        href: websiteDownloadUrl(base, item.file),
        bytes: item.bytes,
        sha256: item.sha256,
        version: manifest.version,
        origin: 'website',
      };
  }
  return result;
}
export function latestReleaseLinks(
  repository: string,
  value: unknown,
): Partial<Record<DownloadKind, DownloadLink>> {
  const repo = normalizeRepository(repository);
  if (!repo || !value || typeof value !== 'object' || Array.isArray(value)) return {};
  const release = value as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets))
    return {};
  const result: Partial<Record<DownloadKind, DownloadLink>> = {};
  for (const kind of Object.keys(DOWNLOAD_FILES) as DownloadKind[]) {
    const item = release.assets.find(
      (raw) =>
        raw &&
        typeof raw === 'object' &&
        raw.name === DOWNLOAD_FILES[kind] &&
        raw.state === 'uploaded' &&
        Number.isSafeInteger(raw.size) &&
        raw.size > 0,
    );
    if (item)
      result[kind] = {
        href: `https://github.com/${repo}/releases/latest/download/${DOWNLOAD_FILES[kind]}`,
        bytes: item.size,
        sha256:
          typeof item.digest === 'string' && /^sha256:[a-fA-F0-9]{64}$/u.test(item.digest)
            ? item.digest.slice(7).toLowerCase()
            : undefined,
        version: typeof release.tag_name === 'string' ? release.tag_name.slice(0, 80) : undefined,
        origin: 'release',
      };
  }
  return result;
}
export async function loadDownloads(
  base: string,
  configuredRepository: unknown,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DownloadState> {
  const repository = normalizeRepository(configuredRepository);
  const releasePage = repository ? `https://github.com/${repository}/releases` : undefined;
  let local: Partial<Record<DownloadKind, DownloadLink>> = {};
  async function json(url: string) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 5000);
    try {
      const response = await fetcher(url, {
        credentials: 'omit',
        cache: 'no-cache',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const text = await response.text();
      if (text.length > 1_000_000) return;
      return JSON.parse(text) as unknown;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  try {
    const manifest = parseDownloadManifest(
      await json(`${base || './'}${base && !base.endsWith('/') ? '/' : ''}downloads/manifest.json`),
    );
    if (manifest) local = linksFromManifest(base, manifest);
  } catch {
    /* An incomplete standalone preview may not have packaged downloads. */
  }
  if (local.windows)
    return {
      status: 'ready',
      ...local,
      repository,
      releasePage,
      message: 'Portable Windows app included. Extract the ZIP and open Mochi.exe.',
    };
  if (repository && !signal?.aborted) {
    try {
      const released = latestReleaseLinks(
        repository,
        await json(`https://api.github.com/repos/${repository}/releases/latest`),
      );
      if (released.windows)
        return {
          status: 'ready',
          ...local,
          ...released,
          repository,
          releasePage,
          message: 'Ready to download from the latest published GitHub Release.',
        };
    } catch {
      /* No published release or a temporary API refusal keeps the fallback honest. */
    }
  }
  return {
    status: 'unavailable',
    ...local,
    repository,
    releasePage,
    message: repository
      ? 'The Windows download is not published yet. Check the repository’s Releases or the latest successful Actions build.'
      : 'This website preview does not include the Windows app yet. The complete handoff ZIP includes Run-Windows/Mochi.exe; a publisher can build website downloads through GitHub Actions.',
  };
}
