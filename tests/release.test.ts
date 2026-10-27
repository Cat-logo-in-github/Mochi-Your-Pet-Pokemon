import { createHash } from 'node:crypto';
import { validateSpriteSourceReceipt } from '../scripts/package-project.mjs';
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertSafeEntries,
  deterministicArchive,
  readTree,
  repositoryRoot,
  REQUIRED_SOURCE_FILES,
  sourceIncludes,
  validateManifestFiles,
  validateSourceFiles,
  validateWebsiteFiles,
} from '../scripts/release-utils.mjs';

const bytes = (text: string) => new TextEncoder().encode(text);
const manifest = {
  manifest_version: 3,
  name: 'Mochi fixture',
  version: '1.0.0',
  permissions: ['storage', 'alarms', 'notifications', 'identity'],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_popup: 'popup.html' },
  options_ui: { page: 'options.html' },
  content_scripts: [{ matches: ['https://*/*'], js: ['content.js'], all_frames: false }],
  icons: { '128': 'icons/icon128.png' },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};
const validExtension = () => ({
  'manifest.json': bytes(JSON.stringify(manifest)),
  'background.js': bytes('export {};'),
  'content.js': bytes('void 0;'),
  'popup.html': bytes('<script type="module" src="./assets/popup.js"></script>'),
  'options.html': bytes('<script type="module" src="./assets/options.js"></script>'),
  'assets/popup.js': bytes('void 0;'),
  'assets/options.js': bytes('void 0;'),
  'icons/icon128.png': new Uint8Array([137, 80, 78, 71]),
});

describe('release validation', () => {
  it('checks pinned source receipts and detects missing or modified upstream sprite inputs', () => {
    const revision = 'a'.repeat(40);
    const original = bytes('source sprite bytes');
    const receipt = {
      repository: 'https://github.com/PMDCollab/SpriteCollab',
      revision,
      files: [
        {
          path: 'spritecollab/eevee/Idle-Anim.png',
          url: `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${revision}/sprite/0133/Idle-Anim.png`,
          sha256: createHash('sha256').update(original).digest('hex'),
          bytes: original.length,
        },
      ],
    };
    const source = {
      'SOURCE.json': bytes(JSON.stringify(receipt)),
      'spritecollab/eevee/Idle-Anim.png': original,
    };
    expect(validateSpriteSourceReceipt(source)).toEqual({ revision, files: 1 });
    source['spritecollab/eevee/Idle-Anim.png'] = bytes('tampered input');
    expect(() => validateSpriteSourceReceipt(source)).toThrow('hash/size mismatch');
    source['spritecollab/eevee/Idle-Anim.png'] = original;
    receipt.files[0].url = receipt.files[0].url.replace(revision, 'master');
    source['SOURCE.json'] = bytes(JSON.stringify(receipt));
    expect(() => validateSpriteSourceReceipt(source)).toThrow('URL is not pinned');
  });

  it('validates static website assets without duplicated project archives', () => {
    const website: Record<string, Uint8Array> = {
      'index.html': bytes(
        '<script type="module" src="./assets/app.js"></script><link href="./assets/app.css" rel="stylesheet">',
      ),
      'assets/app.js': bytes('void 0;'),
      'assets/app.css': bytes('body{}'),
    };
    expect(() => validateWebsiteFiles(website)).not.toThrow();
    delete website['assets/app.js'];
    expect(() => validateWebsiteFiles(website)).toThrow('missing referenced asset');
    website['assets/app.js'] = bytes('void 0;');
    website['downloads/mochi-project.zip'] = bytes('duplicate project fixture');
    expect(() => validateWebsiteFiles(website)).toThrow('must not duplicate');
  });
  it('accepts a self-contained MV3 build and rejects a referenced missing asset', () => {
    expect(validateManifestFiles(validExtension())).toMatchObject({ manifest_version: 3 });
    const broken = validExtension();
    delete (broken as Record<string, Uint8Array>)['assets/options.js'];
    expect(() => validateManifestFiles(broken)).toThrow(
      'Missing extension file: assets/options.js',
    );
    const absentAudio = validExtension();
    absentAudio['manifest.json'] = bytes(
      JSON.stringify({
        ...manifest,
        web_accessible_resources: [{ resources: ['audio/demo.wav'], matches: ['https://*/*'] }],
      }),
    );
    expect(() => validateManifestFiles(absentAudio)).toThrow(
      'Missing extension file: audio/demo.wav',
    );
  });
  it('rejects remote/evaluated CSP and unexpected privileges', () => {
    const unsafe = validExtension();
    unsafe['manifest.json'] = bytes(
      JSON.stringify({ ...manifest, permissions: [...manifest.permissions, 'history'] }),
    );
    expect(() => validateManifestFiles(unsafe)).toThrow('Unexpected permission: history');
    unsafe['manifest.json'] = bytes(
      JSON.stringify({
        ...manifest,
        content_security_policy: {
          extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
        },
      }),
    );
    expect(() => validateManifestFiles(unsafe)).toThrow('Unsafe or missing');
  });
  it.each([
    '../outside.txt',
    '/absolute.txt',
    'a\\b.txt',
    '.env',
    'config/.env.local',
    'tokens.json',
    'private.key',
    'Run-Windows/google-private.dat',
    'apps/windows-companion/google-private.dat.tmp',
    'node_modules/x.js',
  ])('refuses unsafe/secret-like archive entry %s', (name) => {
    expect(() => assertSafeEntries({ [name]: bytes('private') })).toThrow();
  });
  it('permits public configuration examples but detects known private-key patterns', () => {
    expect(() =>
      assertSafeEntries({ '.env.example': bytes('MOCHI_GOOGLE_CLIENT_ID=') }),
    ).not.toThrow();
    const privateKey = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    expect(() => assertSafeEntries({ 'settings.txt': bytes(privateKey) })).toThrow(
      'Secret-like content',
    );
  });
  it('emits identical archives independent of insertion order and preserves manifest at root', () => {
    const forward = validExtension();
    const reverse = Object.fromEntries(Object.entries(forward).reverse());
    const first = deterministicArchive(forward);
    expect(deterministicArchive(reverse)).toEqual(first);
    const unzipped = unzipSync(first);
    expect(unzipped['manifest.json']).toEqual(forward['manifest.json']);
    expect(Object.keys(unzipped).some((name) => name.startsWith('dist/'))).toBe(false);
  });
  it('rejects incomplete source distributions and redundant generated artifacts', () => {
    const source = Object.fromEntries(
      REQUIRED_SOURCE_FILES.map((name) => [name, bytes('fixture')]),
    );
    expect(() => validateSourceFiles(source)).not.toThrow();
    delete source['package-lock.json'];
    expect(() => validateSourceFiles(source)).toThrow('package-lock.json');
    source['package-lock.json'] = bytes('{}');
    source['apps/extension/dist/manifest.json'] = bytes('{}');
    expect(() => validateSourceFiles(source)).toThrow('redundant build outputs');
  });
  it('selects application and canonical artwork source while excluding generated copies and private files', async () => {
    const workRoot = path.resolve(repositoryRoot, 'work');
    await mkdir(workRoot, { recursive: true });
    const fixtureRoot = await mkdtemp(path.join(workRoot, 'release-selection-'));
    const resolved = path.resolve(fixtureRoot);
    if (!resolved.startsWith(workRoot + path.sep))
      throw new Error('Refused unsafe fixture cleanup.');
    const expected = [
      ...REQUIRED_SOURCE_FILES,
      'apps/web/src/main.tsx',
      'docs/google-setup.md',
      '.github/workflows/deploy-pages.yml',
      'packages/pet-assets/source/eevee/Idle-Anim.png',
      'packages/pet-assets/source/eevee/AnimData.xml',
      'packages/pet-assets/source/CREDITS.md',
      'packages/pet-assets/public/mochi/atlases/idle.png',
    ];
    const excluded = [
      'node_modules/unwanted.js',
      'apps/web/dist/index.html',
      'apps/web/public/mochi/manifest.json',
      '.env',
      '.git/config',
      'packages/pet-assets/work/frame.png',
      'packages/pet-assets/source/Mochi-3D.blend1',
      'packages/pet-assets/source/Mochi-3D.blend',
      'packages/pet-assets/source/toon_cat.glb',
      'packages/pet-assets/tools/__pycache__/cache.pyc',
    ];
    try {
      for (const name of [...expected, ...excluded]) {
        const target = path.join(fixtureRoot, name);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, 'safe fixture data');
      }
      const source = await readTree(fixtureRoot, sourceIncludes);
      validateSourceFiles(source);
      assertSafeEntries(source);
      for (const name of expected) expect(source[name], name).toBeDefined();
      for (const name of excluded) expect(source[name], name).toBeUndefined();
      expect(sourceIncludes('apps/extension/.env.local', false)).toBe(false);
    } finally {
      await rm(resolved, { recursive: true, force: true });
    }
  });
});
