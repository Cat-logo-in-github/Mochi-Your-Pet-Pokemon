import type { PetClip, PetManifest } from '../../packages/shared/src/pet';
export function fixtureClip(
  action: PetClip['action'],
  frames = 144,
  fps = 12,
  loop = true,
  direction = 'front',
  skin: PetClip['skin'] = 'eevee',
): PetClip {
  return {
    action,
    skin,
    direction,
    fps,
    frameCount: frames,
    loop,
    atlases: Array.from(
      { length: Math.ceil(frames / 32) },
      (_, i) => `atlases/${action}_${skin}_${direction}_${i}.png`,
    ),
  };
}
export function fixturePetManifest(): PetManifest {
  const clips = [
    fixtureClip('idle'),
    fixtureClip('groom', 288, 24, false),
    fixtureClip('happy', 192, 24, false),
    fixtureClip('alert', 144, 24, false),
    fixtureClip('walk', 96, 24, true, 'left'),
    fixtureClip('walk', 96, 24, true, 'right'),
    fixtureClip('stretch', 192, 24, false),
    fixtureClip('carry', 72, 24, true),
  ];
  return {
    version: 2,
    render: 'sprite-sheet-2d',
    tileSize: 256,
    columns: 8,
    rows: 4,
    framesPerAtlas: 32,
    defaultSkin: 'eevee',
    defaultDirection: 'front',
    clips: Object.fromEntries(
      clips.map((clip) => [`${clip.action}_${clip.skin}_${clip.direction}`, clip]),
    ),
  };
}
