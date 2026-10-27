import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { googleBuildSettings } from '../apps/extension/google-build-config.mjs';
const config = JSON.parse(
  readFileSync(new URL('../apps/extension/google-public.json', import.meta.url), 'utf8'),
);
describe('zero-shared-quota Google build boundary', () => {
  it('keeps default public builds OAuth-free with the fixed public identity', () => {
    expect(config.clientId).toBe('');
    const manifest = googleBuildSettings(config, {});
    expect(manifest).not.toHaveProperty('oauth2');
    expect(manifest.key).toBe(config.extensionPublicKey);
  });
  it('rejects a configured source ID or accidental public environment ID', () => {
    expect(() =>
      googleBuildSettings({ ...config, clientId: 'personal.apps.googleusercontent.com' }, {}),
    ).toThrow(/blank/u);
    expect(() =>
      googleBuildSettings(config, {
        MOCHI_GOOGLE_CLIENT_ID: 'personal.apps.googleusercontent.com',
      }),
    ).toThrow(/public build/u);
    expect(() => googleBuildSettings({ ...config, clientSecret: 'never-allowed' }, {})).toThrow(
      /only public/u,
    );
  });
  it('requires an explicit private mode and user-owned public client ID', () => {
    expect(() => googleBuildSettings(config, {}, true)).toThrow(/requires your own/u);
    expect(() => googleBuildSettings(config, { MOCHI_GOOGLE_CLIENT_ID: 'invalid' }, true)).toThrow(
      /valid public/u,
    );
    expect(
      googleBuildSettings(
        config,
        { MOCHI_GOOGLE_CLIENT_ID: 'personal.apps.googleusercontent.com' },
        true,
      ).oauth2,
    ).toEqual({ client_id: 'personal.apps.googleusercontent.com', scopes: [] });
  });
});
