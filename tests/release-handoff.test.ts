import { describe, expect, it } from 'vitest';
import {
  composeCompleteFiles,
  createDownloadManifest,
  validateCompleteFiles,
  validateDownloadManifest,
} from '../scripts/release-handoff.mjs';
import {
  assertPublicGoogleConfiguration,
  REQUIRED_SOURCE_FILES,
  sourceIncludes,
} from '../scripts/release-utils.mjs';
const bytes = (text: string) => new TextEncoder().encode(text);
function source() {
  return Object.fromEntries(REQUIRED_SOURCE_FILES.map((name) => [name, bytes('source fixture')]));
}
function browser() {
  return {
    'manifest.json': bytes(
      JSON.stringify({
        manifest_version: 3,
        name: 'Mochi',
        version: '1.2.0',
        permissions: ['storage', 'alarms', 'notifications'],
        background: { service_worker: 'background.js', type: 'module' },
        action: { default_popup: 'popup.html' },
        options_page: 'options.html',
        content_scripts: [{ js: ['content.js'] }],
        content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
      }),
    ),
    'background.js': bytes('void 0;'),
    'content.js': bytes('void 0;'),
    'popup.html': bytes('<p>Mochi</p>'),
    'options.html': bytes('<p>Options</p>'),
  };
}
function windows() {
  const executable = new Uint8Array(64);
  executable.set([0x4d, 0x5a]);
  return { 'Mochi.exe': executable, 'README.md': bytes('Run Mochi.exe') };
}
describe('complete downloadable handoff', () => {
  it('keeps source at the GitHub root and includes runnable native and unpacked browser folders', () => {
    const sourceFiles = source(),
      nativeFiles = windows(),
      browserFiles = browser();
    const files = composeCompleteFiles(sourceFiles, nativeFiles, browserFiles);
    expect(files['.github/workflows/ci.yml']).toEqual(sourceFiles['.github/workflows/ci.yml']);
    expect(files['Run-Windows/Mochi.exe']).toEqual(nativeFiles['Mochi.exe']);
    expect(files['Browser-Extension/manifest.json']).toEqual(browserFiles['manifest.json']);
    expect(() =>
      validateCompleteFiles(files, sourceFiles, nativeFiles, browserFiles),
    ).not.toThrow();
    files['Run-Windows/Mochi.exe'] = bytes('not the verified executable');
    expect(() => validateCompleteFiles(files, sourceFiles, nativeFiles, browserFiles)).toThrow(
      'differs',
    );
  });
  it('rejects a missing executable and any unexpected file added to a complete handoff', () => {
    expect(() => composeCompleteFiles(source(), {}, browser())).toThrow(
      'actual Windows executable',
    );
    const files = composeCompleteFiles(source(), windows(), browser());
    files['personal-state.json'] = bytes('{}');
    expect(() => validateCompleteFiles(files, source(), windows(), browser())).toThrow(
      'unexpected',
    );
  });
  it('does not include runnable handoff folders in the canonical GitHub source archive', () => {
    expect(sourceIncludes('Run-Windows', true)).toBe(false);
    expect(sourceIncludes('Browser-Extension', true)).toBe(false);
  });
  it('lists only actual artifacts and rejects stale bytes, forged native availability and wrong versions', () => {
    const bundles = new Map([
      ['mochi-project.zip', bytes('source')],
      ['mochi-chrome-extension.zip', bytes('browser')],
    ]);
    const manifest = createDownloadManifest('1.2.0', bundles);
    expect(manifest.assets.windows).toBeUndefined();
    expect(() => validateDownloadManifest(manifest, '1.2.0', bundles)).not.toThrow();
    bundles.set('mochi-windows-companion.zip', bytes('native'));
    expect(() => validateDownloadManifest(manifest, '1.2.0', bundles)).toThrow('does not match');
    const complete = createDownloadManifest('1.2.0', bundles);
    expect(complete.assets.windows?.file).toBe('mochi-windows-companion.zip');
    bundles.set('mochi-windows-companion.zip', bytes('different native'));
    expect(() => validateDownloadManifest(complete, '1.2.0', bundles)).toThrow('does not match');
    expect(() => validateDownloadManifest(complete, '1.2.1', bundles)).toThrow('does not match');
  });
});
describe('public Google project boundary', () => {
  it('allows a blank public configuration and blocks a personal source configuration', () => {
    const config = { clientId: '', extensionId: 'public-id', extensionPublicKey: 'public-key' };
    const files = { 'apps/extension/google-public.json': bytes(JSON.stringify(config)) };
    expect(() => assertPublicGoogleConfiguration(files)).not.toThrow();
    config.clientId = 'personal.apps.googleusercontent.com';
    files['apps/extension/google-public.json'] = bytes(JSON.stringify(config));
    expect(() => assertPublicGoogleConfiguration(files)).toThrow('keep the Google client ID blank');
  });
  it.each(['manifest.json', 'apps/extension/manifest.json', 'Browser-Extension/manifest.json'])(
    'blocks OAuth configuration in %s',
    (name) => {
      expect(() =>
        assertPublicGoogleConfiguration({
          [name]: bytes(
            JSON.stringify({ oauth2: { client_id: 'personal.apps.googleusercontent.com' } }),
          ),
        }),
      ).toThrow('cannot enter a public release');
    },
  );
  it('blocks unexpected secret/config fields even when the client ID is blank', () => {
    expect(() =>
      assertPublicGoogleConfiguration({
        'apps/extension/google-public.json': bytes(
          JSON.stringify({ clientId: '', clientSecret: 'private' }),
        ),
      }),
    ).toThrow('unexpected fields');
  });
});
