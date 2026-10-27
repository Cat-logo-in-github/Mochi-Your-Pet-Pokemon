import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PET_ACTIONS,
  PET_DIRECTIONS,
  PET_SKINS,
  clipFrameAt,
  clipFrameDelay,
  cursorAmbushEligible,
  petAtlasFrame,
  petClipMilliseconds,
  petDirection,
  selectPetClip,
  validatePetManifest,
} from '@mochi/shared';
import { fixtureClip, fixturePetManifest } from './fixtures/petManifest';

describe('shared 2D sprite artwork contract and elapsed-time animation', () => {
  it('loads the shipped nine-species catalog without losing source timing or provenance', () => {
    const assetRoot = new URL('../packages/pet-assets/public/mochi/', import.meta.url);
    const original = JSON.parse(readFileSync(new URL('manifest.json', assetRoot), 'utf8'));
    const manifest = validatePetManifest(original);
    expect(Object.keys(manifest.clips)).toHaveLength(Object.keys(original.clips).length);
    expect(Object.keys(manifest.clips).length).toBeGreaterThan(2000);
    expect(manifest.sourceActionsCatalog?.length).toBeGreaterThanOrEqual(44);
    for (const skin of PET_SKINS) {
      expect(existsSync(new URL(`posters/${skin}.png`, assetRoot))).toBe(true);
      for (const action of PET_ACTIONS)
        expect(manifest.clips[`${action}_${skin}_front`]).toBeTruthy();
      for (const action of ['walk', 'run'])
        for (const direction of PET_DIRECTIONS)
          expect(manifest.clips[`${action}_${skin}_${direction}`]).toBeTruthy();
    }
    for (const [key, clip] of Object.entries(manifest.clips)) {
      expect(clip.sourceAnimation).toBe(original.clips[key].sourceAnimation);
      expect(clip.frameDurationsMs).toEqual(original.clips[key].frameDurationsMs);
    }
    for (const entry of manifest.sourceActionsCatalog ?? []) {
      for (const skin of entry.skins)
        for (const direction of entry.directionsBySkin?.[skin] ?? ['front'])
          expect(manifest.clips[`${entry.action}_${skin}_${direction}`]).toBeTruthy();
    }
  });
  it('validates version2 and every atlas required by the full frame count', () => {
    const manifest = fixturePetManifest();
    expect(validatePetManifest(manifest).clips.groom_eevee_front.atlases).toHaveLength(9);
    const broken = structuredClone(manifest);
    broken.clips.groom_eevee_front.atlases.pop();
    expect(() => validatePetManifest(broken)).toThrow(/invalid/u);
    expect(() => validatePetManifest({ ...manifest, version: 1 })).toThrow(/unsupported/u);
  });
  it('supports every Eevee evolution and all drawn action headings in a complete library', () => {
    const manifest = fixturePetManifest();
    manifest.clips = {};
    for (const skin of PET_SKINS)
      for (const action of PET_ACTIONS)
        for (const direction of PET_DIRECTIONS) {
          const clip = fixtureClip(action, 32, 12, true, direction, skin);
          manifest.clips[`${action}_${skin}_${direction}`] = clip;
        }
    const valid = validatePetManifest(manifest);
    expect(Object.keys(valid.clips)).toHaveLength(936);
    for (const skin of PET_SKINS)
      expect(selectPetClip(valid, 'play', skin, 'back-left').skin).toBe(skin);
  });
  it('allows a bounded complete source catalog with 4096 clips', () => {
    const manifest = fixturePetManifest();
    for (let index = Object.keys(manifest.clips).length; index < 4096; index++) {
      const action = `pmd_source${index}` as const;
      manifest.clips[`${action}_eevee_front`] = fixtureClip(action, 1, 0.5);
    }
    expect(Object.keys(validatePetManifest(manifest).clips)).toHaveLength(4096);
    manifest.clips.pmd_overflow_eevee_front = fixtureClip('pmd_overflow', 1, 0.5);
    expect(() => validatePetManifest(manifest)).toThrow(/clip count/u);
  });
  it('requires 2D sprite metadata and rejects retired appearance IDs', () => {
    const manifest = fixturePetManifest();
    expect(() => validatePetManifest({ ...manifest, render: 'pre-rendered-3d' })).toThrow(
      /unsupported/u,
    );
    const clip = manifest.clips.idle_eevee_front;
    delete manifest.clips.idle_eevee_front;
    manifest.clips.idle_lavender_front = { ...clip, skin: 'lavender' } as unknown as typeof clip;
    expect(() => validatePetManifest(manifest)).toThrow(/invalid/u);
  });
  it.each([
    '../outside.png',
    'https://example.com/remote.png',
    'atlases/../../secret.png',
    'atlases/x.js',
    'atlases/a.png?remote=1',
  ])('rejects an untrusted atlas reference: %s', (path) => {
    const manifest = fixturePetManifest();
    manifest.clips.idle_eevee_front.atlases[0] = path;
    expect(() => validatePetManifest(manifest)).toThrow();
  });
  it('selects actual rendered directions and nearest available headings without mirroring', () => {
    const manifest = fixturePetManifest();
    expect(selectPetClip(manifest, 'walk', 'eevee', 'left').direction).toBe('left');
    expect(selectPetClip(manifest, 'walk', 'eevee', 'front-left').direction).toBe('left');
    expect(selectPetClip(manifest, 'groom', 'leafeon', 'back').direction).toBe('front');
    expect(selectPetClip(manifest, 'groom', 'leafeon', 'back').skin).toBe('eevee');
    expect(selectPetClip(manifest, 'feed', 'eevee').action).toBe('idle');
  });
  it('honors original variable frame holds and schedules only their boundaries', () => {
    const clip = { ...fixtureClip('play', 3, 2, false), frameDurationsMs: [80, 420, 160] };
    expect(petClipMilliseconds(clip)).toBe(660);
    expect(clipFrameAt(clip, 79)).toEqual({ frame: 0, complete: false });
    expect(clipFrameAt(clip, 80)).toEqual({ frame: 1, complete: false });
    expect(clipFrameAt(clip, 499)).toEqual({ frame: 1, complete: false });
    expect(clipFrameAt(clip, 500)).toEqual({ frame: 2, complete: false });
    expect(clipFrameAt(clip, 660)).toEqual({ frame: 2, complete: true });
    expect(clipFrameDelay(clip, 100)).toBe(400);
    expect(clipFrameDelay(clip, 660)).toBeNull();
    clip.loop = true;
    expect(clipFrameAt(clip, 1320)).toEqual({ frame: 0, complete: false });
    expect(clipFrameAt(clip, 1400)).toEqual({ frame: 1, complete: false });
    expect(clipFrameDelay(clip, 1320)).toBe(80);
  });
  it('retains safe source animation IDs, per-frame holds, and their catalog', () => {
    const manifest = fixturePetManifest();
    manifest.clips.pmd_attack_eevee_front = {
      ...fixtureClip('pmd_attack', 3, 0.5, false),
      sourceAnimation: 'Attack',
      frameDurationsMs: [80, 420, 160],
    };
    manifest.sourceActionsCatalog = [
      {
        action: 'pmd_attack',
        label: 'Attack',
        skins: ['eevee'],
        sourceName: 'Attack',
        directionsBySkin: { eevee: ['front'] },
      },
    ];
    const parsed = validatePetManifest(manifest);
    expect(parsed.clips.pmd_attack_eevee_front.duration).toBe(0.66);
    expect(parsed.clips.pmd_attack_eevee_front.sourceAnimation).toBe('Attack');
    expect(parsed.clips.pmd_attack_eevee_front.frameDurationsMs).toEqual([80, 420, 160]);
    expect(parsed.sourceActionsCatalog?.[0].label).toBe('Attack');
    expect(parsed.sourceActionsCatalog?.[0].directionsBySkin?.eevee).toEqual(['front']);
    for (const action of ['pmd_../outside', 'pmd_<script>', 'pmd_']) {
      const invalid = {
        ...manifest,
        clips: {
          ...manifest.clips,
          [`${action}_eevee_front`]: { ...manifest.clips.pmd_attack_eevee_front, action },
        },
      };
      expect(() => validatePetManifest(invalid)).toThrow(/invalid/u);
    }
  });
  it.each([
    { eevee: ['sideways'] },
    { unknown: ['front'] },
    { sylveon: ['front'] },
    { eevee: ['front', 'front'] },
    { eevee: [] },
    ['front'],
  ])('rejects invalid source direction availability %j', (directionsBySkin) => {
    const manifest = fixturePetManifest();
    const catalog = [{ action: 'pmd_attack', label: 'Attack', skins: ['eevee'], directionsBySkin }];
    expect(() => validatePetManifest({ ...manifest, sourceActionsCatalog: catalog })).toThrow(
      /directions/u,
    );
  });
  it.each([
    [80, 420],
    [80, 0, 160],
    [80, NaN, 160],
    [80, 13, 160],
  ])('rejects missing or unsafe source frame holds %j', (...holds) => {
    const manifest = fixturePetManifest();
    manifest.clips.idle_eevee_front = {
      ...fixtureClip('idle', 3, 60, true),
      frameDurationsMs: holds,
    };
    expect(() => validatePetManifest(manifest)).toThrow(/holds/u);
  });
  it('uses all metadata frames for long actions and settles on the final frame', () => {
    const clip = fixtureClip('groom', 288, 24, false);
    expect(petClipMilliseconds(clip)).toBe(12000);
    expect(clipFrameAt(clip, 8000)).toEqual({ frame: 192, complete: false });
    expect(clipFrameAt(clip, 11999)).toEqual({ frame: 287, complete: false });
    expect(clipFrameAt(clip, 12000)).toEqual({ frame: 287, complete: true });
    expect(clipFrameAt(clip, 999999)).toEqual({ frame: 287, complete: true });
    expect(clipFrameAt(clip, -1)).toEqual({ frame: 0, complete: false });
  });
  it('loops by real elapsed time rather than replaying queued frame callbacks', () => {
    const clip = fixtureClip('idle', 144, 12, true);
    expect(clipFrameAt(clip, 12000)).toEqual({ frame: 0, complete: false });
    expect(clipFrameAt(clip, 12250)).toEqual({ frame: 3, complete: false });
    expect(clipFrameAt(clip, 360500)).toEqual({ frame: 6, complete: false });
  });
  it('maps atlas boundaries and final partial rows exactly', () => {
    const manifest = fixturePetManifest(),
      clip = fixtureClip('groom', 70, 24, false);
    expect(petAtlasFrame(manifest, clip, 31)).toMatchObject({ atlasIndex: 0, column: 7, row: 3 });
    expect(petAtlasFrame(manifest, clip, 32)).toMatchObject({ atlasIndex: 1, column: 0, row: 0 });
    expect(petAtlasFrame(manifest, clip, 69)).toMatchObject({ atlasIndex: 2, column: 5, row: 0 });
  });
  it.each([
    [0, 1, 'front'],
    [1, 1, 'front-right'],
    [1, 0, 'right'],
    [1, -1, 'back-right'],
    [0, -1, 'back'],
    [-1, -1, 'back-left'],
    [-1, 0, 'left'],
    [-1, 1, 'front-left'],
  ] as const)('resolves the movement vector %s,%s to %s', (x, y, direction) => {
    expect(petDirection(x * 100, y * 100)).toBe(direction);
  });
  it('requires explicit following consent, a fresh pointer sample and a forty-second cooldown', () => {
    expect(cursorAmbushEligible(false, false, 0, 50000, 50000)).toBe(false);
    expect(cursorAmbushEligible(true, true, 0, 50000, 50000)).toBe(false);
    expect(cursorAmbushEligible(true, false, 11000, 50000, 50000)).toBe(false);
    expect(cursorAmbushEligible(true, false, 10000, 43999, 50000)).toBe(false);
    expect(cursorAmbushEligible(true, false, 10000, 50001, 50000)).toBe(false);
    expect(cursorAmbushEligible(true, false, 10000, 50000, 50000)).toBe(true);
  });
});
