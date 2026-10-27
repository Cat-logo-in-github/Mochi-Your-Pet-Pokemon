import { chooseReleaseTag } from '../.github/scripts/release-tag.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
  latestReleaseLinks,
  linksFromManifest,
  loadDownloads,
  normalizeRepository,
  parseDownloadManifest,
  websiteDownloadUrl,
} from '../apps/web/src/downloads';
const digest = 'a'.repeat(64);
const manifest = () => ({
  version: '1.2.0',
  assets: {
    windows: { file: 'mochi-windows-companion.zip', sha256: digest, bytes: 12345 },
    browser: { file: 'mochi-chrome-extension.zip', sha256: digest, bytes: 6789 },
    source: { file: 'mochi-project.zip', sha256: digest, bytes: 9876 },
  },
});
const release = () => ({
  draft: false,
  prerelease: false,
  tag_name: 'v1.2.0',
  assets: [
    {
      name: 'mochi-windows-companion.zip',
      state: 'uploaded',
      size: 12345,
      digest: `sha256:${digest}`,
    },
  ],
});

describe('runnable download availability', () => {
  it.each([
    ['./', './downloads/mochi-windows-companion.zip'],
    ['/mochi/', '/mochi/downloads/mochi-windows-companion.zip'],
    ['/', '/downloads/mochi-windows-companion.zip'],
    ['/mochi', '/mochi/downloads/mochi-windows-companion.zip'],
  ])('keeps native downloads inside the correct website base %s', (base, expected) => {
    expect(websiteDownloadUrl(base, 'mochi-windows-companion.zip')).toBe(expected);
    expect(linksFromManifest(base, parseDownloadManifest(manifest())!).windows?.href).toBe(
      expected,
    );
  });
  it('accepts public owner/repo configuration and refuses URLs, credentials and traversal', () => {
    expect(normalizeRepository('octo-org/mochi')).toBe('octo-org/mochi');
    for (const input of [
      '',
      undefined,
      'https://github.com/alice/mochi',
      'alice/../secrets',
      'alice/..',
      'alice/mochi?token=secret',
      'user:token@github.com/repo',
    ])
      expect(normalizeRepository(input)).toBeUndefined();
    expect(() => websiteDownloadUrl('/', '../private.zip')).toThrow('Unknown');
  });
  it('requires exact artifact names, actual sizes and SHA-256 in the local manifest', () => {
    const raw = manifest();
    raw.assets.windows.file = '../outside.zip';
    expect(parseDownloadManifest(raw)?.assets.windows).toBeUndefined();
    raw.assets.windows.file = 'mochi-windows-companion.zip';
    raw.assets.windows.sha256 = 'not a hash';
    expect(parseDownloadManifest(raw)?.assets.windows).toBeUndefined();
    raw.assets.windows.sha256 = digest;
    raw.assets.windows.bytes = 0;
    expect(parseDownloadManifest(raw)?.assets.windows).toBeUndefined();
  });
  it('only constructs latest-release native links after the actual uploaded asset is present', () => {
    expect(latestReleaseLinks('alice/mochi', release()).windows?.href).toBe(
      'https://github.com/alice/mochi/releases/latest/download/mochi-windows-companion.zip',
    );
    expect(latestReleaseLinks('alice/mochi', { ...release(), assets: [] }).windows).toBeUndefined();
    expect(
      latestReleaseLinks('alice/mochi', { ...release(), draft: true }).windows,
    ).toBeUndefined();
    expect(
      latestReleaseLinks('alice/mochi', { ...release(), prerelease: true }).windows,
    ).toBeUndefined();
  });
  it('uses packaged local native downloads without a GitHub account or external metadata call', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(manifest())));
    const state = await loadDownloads('/demo/', '', fetcher);
    expect(state.status).toBe('ready');
    expect(state.windows?.href).toBe('/demo/downloads/mochi-windows-companion.zip');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('shows an unavailable state without inventing a repository or a runnable source download', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const state = await loadDownloads('./', '', fetcher);
    expect(state.status).toBe('unavailable');
    expect(state.windows).toBeUndefined();
    expect(state.repository).toBeUndefined();
    expect(state.message).toContain('Run-Windows/Mochi.exe');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('falls back to a verified public release and stays unavailable when that release has no native asset', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(release())));
    const state = await loadDownloads('/mochi/', 'alice/mochi', fetcher);
    expect(state.status).toBe('ready');
    expect(state.windows?.href).toBe(
      'https://github.com/alice/mochi/releases/latest/download/mochi-windows-companion.zip',
    );
    const absent = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...release(), assets: [] })));
    expect((await loadDownloads('/mochi/', 'alice/mochi', absent)).status).toBe('unavailable');
  });
});

describe('published release source integrity', () => {
  const source = 'a'.repeat(40);
  it('uses a new version tag or reuses it only for the same source commit', () => {
    expect(chooseReleaseTag('1.2.0', source, '', 7)).toBe('v1.2.0');
    expect(chooseReleaseTag('1.2.0', source, source, 7)).toBe('v1.2.0');
  });
  it('chooses a distinct stable release tag when the version already names different source', () => {
    expect(chooseReleaseTag('1.2.0', source, 'b'.repeat(40), 7)).toBe('v1.2.0-build.7');
    expect(() => chooseReleaseTag('1.2.0; unsafe', source, '', 7)).toThrow('Invalid release');
  });
});
