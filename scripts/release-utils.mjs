import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync } from 'fflate';
import { validatePetAssets } from './pet-asset-validation.mjs';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const utf8 = new TextDecoder();

export async function readTree(directory, shouldInclude = () => true, prefix = '') {
  const result = {};
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!shouldInclude(name, entry.isDirectory())) continue;
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await readTree(absolute, shouldInclude, name));
    else if (entry.isFile()) result[name] = new Uint8Array(await readFile(absolute));
  }
  return result;
}

export function assertSafeEntries(entries) {
  const names = Object.keys(entries);
  if (!names.length) throw new Error('Archive has no files.');
  for (const name of names) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..'))
      throw new Error(`Unsafe archive path: ${name}`);
    const parts = name.toLowerCase().split('/');
    if (parts.some((part) => ['node_modules', '.git', '.cache', 'target'].includes(part)))
      throw new Error(`Forbidden archive directory: ${name}`);
    const file = parts.at(-1);
    if (
      (file.startsWith('.env') && file !== '.env.example') ||
      /\.(pem|p12|pfx|key|map)$/.test(file) ||
      /^(credentials|secrets|tokens?)([.-]|$)/.test(file) ||
      /^google-private\.dat(?:\.tmp)?$/.test(file)
    )
      throw new Error(`Secret-like or development file: ${name}`);
    const bytes = entries[name];
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error(`Unexpected oversized file: ${name}`);
    if (/\.(?:js|mjs|json|ts|tsx|html|md|txt|ya?ml)$/.test(name)) {
      const text = utf8.decode(bytes);
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[a-zA-Z0-9]{40,}\b/.test(
          text,
        )
      )
        throw new Error(`Secret-like content: ${name}`);
    }
  }
}

export function validateManifestFiles(files) {
  const requireFile = (name) => {
    if (typeof name !== 'string' || !files[name]?.length)
      throw new Error(`Missing extension file: ${String(name)}`);
  };
  requireFile('manifest.json');
  const manifest = JSON.parse(utf8.decode(files['manifest.json']).replace(/^\uFEFF/, ''));
  if (manifest.manifest_version !== 3) throw new Error('Extension must use Manifest V3.');
  if (!manifest.name || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version))
    throw new Error('Invalid extension name/version.');
  if (manifest.background?.type !== 'module')
    throw new Error('Background worker must be an ES module.');
  requireFile(manifest.background?.service_worker);
  requireFile(manifest.action?.default_popup);
  requireFile(manifest.options_page || manifest.options_ui?.page);
  const allowedPermissions = new Set([
    'storage',
    'alarms',
    'notifications',
    'identity',
    'activeTab',
    'scripting',
  ]);
  for (const permission of manifest.permissions || []) {
    if (!allowedPermissions.has(permission))
      throw new Error(`Unexpected permission: ${permission}`);
  }
  for (const permission of ['storage', 'alarms', 'notifications'])
    if (!manifest.permissions?.includes(permission))
      throw new Error(`Missing permission: ${permission}`);
  if (manifest.externally_connectable)
    throw new Error('Externally connectable messaging must stay absent.');
  const csp = manifest.content_security_policy?.extension_pages || '';
  if (!csp.includes("script-src 'self'") || /unsafe-eval|https?:/.test(csp))
    throw new Error('Unsafe or missing MV3 content security policy.');
  if (!manifest.content_scripts?.length) throw new Error('Missing pet content script.');
  for (const content of manifest.content_scripts) {
    if (content.all_frames && !(content.js?.length === 1 && content.js[0] === 'media-bridge.js'))
      throw new Error(
        'Pet must mount only once in the top-level page; only the isolated media bridge may run in frames.',
      );
    for (const file of [...(content.js || []), ...(content.css || [])]) requireFile(file);
  }
  for (const value of Object.values(manifest.icons || {})) requireFile(value);
  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const resource of resourceGroup.resources || []) {
      if (!resource.includes('*')) requireFile(resource);
    }
  }
  for (const file of Object.keys(files).filter((name) => name.endsWith('.html'))) {
    const html = utf8.decode(files[file]);
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if (/^(?:https?:|data:|#)/.test(match[1])) continue;
      const relative = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), match[1].replace(/^\//, '')),
      );
      requireFile(relative);
    }
  }
  return manifest;
}

export async function assertFile(directory, filename) {
  const location = path.join(directory, filename);
  const information = await stat(location).catch(() => null);
  if (!information?.isFile() || !information.size)
    throw new Error(`Required output missing: ${location}`);
  return location;
}

export const REQUIRED_SOURCE_FILES = [
  'README.md',
  'START-HERE.md',
  'LICENSE',
  'package.json',
  'package-lock.json',
  '.npmrc',
  'apps/extension/package.json',
  'apps/web/package.json',
  'packages/shared/src/index.ts',
  'scripts/package-release.mjs',
  '.github/workflows/ci.yml',
];
const allowedRoots = new Set(['apps', 'packages', 'scripts', 'tests', 'docs', '.github']);
const allowedFiles = new Set([
  'README.md',
  'START-HERE.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  '.gitignore',
  '.env.example',
  '.npmrc',
  '.prettierignore',
  '.prettierrc.json',
  'package.json',
  'package-lock.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'vitest.config.ts',
]);
const skippedParts = new Set([
  'node_modules',
  'dist',
  'target',
  'work',
  '.git',
  '.cache',
  '.vite',
  'coverage',
  'downloads',
  'test-results',
  'playwright-report',
  '__pycache__',
  '.pytest_cache',
]);
export function sourceIncludes(name, directory) {
  const parts = name.split('/');
  if (parts.some((part) => skippedParts.has(part))) return false;
  if (name === 'apps/web/public/mochi' || name.startsWith('apps/web/public/mochi/')) return false;
  if (parts.length === 1) return directory ? allowedRoots.has(name) : allowedFiles.has(name);
  if (parts.at(-1).startsWith('.env') && parts.at(-1) !== '.env.example') return false;
  return !/\.(map|log|zip|pyc|pyo|png\.tmp|blend\d*|glb|gltf|fbx|obj)$/.test(name);
}
export function validateSourceFiles(files) {
  for (const required of REQUIRED_SOURCE_FILES)
    if (!files[required]?.length) throw new Error(`Source ZIP missing ${required}`);
  if (Object.keys(files).some((file) => file.split('/').includes('dist') || file.endsWith('.zip')))
    throw new Error('Source ZIP contains redundant build outputs.');
}
export function deterministicArchive(files) {
  // Construct a local DOS timestamp so the emitted ZIP date stays identical across timezones.
  const fixedDate = new Date(2020, 0, 1, 0, 0, 0);
  return zipSync(
    Object.fromEntries(
      Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([name, bytes]) => [name, [bytes, { mtime: fixedDate }]]),
    ),
    { level: 9 },
  );
}

export function validateWebsiteFiles(files) {
  if (!files['index.html']?.length) throw new Error('Website ZIP missing index.html at root.');
  const html = new TextDecoder().decode(files['index.html']);
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const reference = match[1].split(/[?#]/)[0];
    if (!reference || reference.startsWith('#') || /^(?:https?:|data:)/.test(reference)) continue;
    const normalized = path.posix.normalize(reference).replace(/^\.?\//, '');
    // Support both relative-base builds and Pages project paths, whose prefix is deployment-specific.
    const candidates = Object.keys(files).filter(
      (name) => normalized === name || normalized.endsWith(`/${name}`),
    );
    if (candidates.length !== 1 || !files[candidates[0]]?.length)
      throw new Error(`Website ZIP missing referenced asset: ${reference}`);
  }
  if (Object.keys(files).some((name) => name.toLowerCase().endsWith('.zip')))
    throw new Error('Compiled website ZIP must not duplicate project or release archives.');
}

export function validateWindowsFiles(files) {
  const prefix = 'assets/mochi/';
  const assets = Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, bytes]) => [name.slice(prefix.length), bytes]),
  );
  validatePetAssets(assets, { quality: false });
  for (const required of ['Mochi.exe.config', 'README.md', 'LICENSE']) {
    if (!files[required]?.length) throw new Error(`Windows companion ZIP missing ${required}`);
  }
  const executable = files['Mochi.exe'];
  if (!executable || executable.length < 64 || executable[0] !== 0x4d || executable[1] !== 0x5a)
    throw new Error('Windows companion ZIP must contain a built Mochi.exe at its root.');
}

// Public releases must never carry a publisher's or a tester's Google project.
// Personal OAuth builds are deliberately usable only outside release packaging.
export function assertPublicGoogleConfiguration(files) {
  for (const name of [
    'manifest.json',
    'apps/extension/manifest.json',
    'Browser-Extension/manifest.json',
  ]) {
    if (!files[name]) continue;
    const manifest = JSON.parse(utf8.decode(files[name]).replace(/^\uFEFF/, ''));
    if (manifest.oauth2)
      throw new Error(
        'Personal Google OAuth configuration cannot enter a public release. Rebuild without --personal-google.',
      );
  }
  const config = files['apps/extension/google-public.json'];
  if (config) {
    const value = JSON.parse(utf8.decode(config).replace(/^\uFEFF/, ''));
    if (value.clientId !== '')
      throw new Error('Public source must keep the Google client ID blank.');
    if (
      Object.keys(value).some(
        (key) => !['clientId', 'extensionPublicKey', 'extensionId'].includes(key),
      )
    )
      throw new Error('Public Google configuration contains unexpected fields.');
  }
}
