import type { Skin, FollowCursorFrequency } from './types';
import { PET_SKINS } from './types';

export const PET_ACTIONS = [
  'idle',
  'walk',
  'run',
  'turn',
  'stretch',
  'groom',
  'pounce',
  'play',
  'feed',
  'happy',
  'sleep',
  'alert',
  'carry',
] as const;
export type PetCoreAction = (typeof PET_ACTIONS)[number];
export type PetAction = PetCoreAction | `pmd_${string}`;
export function isPetAction(value: unknown): value is PetAction {
  return (
    typeof value === 'string' &&
    (PET_ACTIONS.includes(value as PetCoreAction) || /^pmd_[a-z0-9][a-z0-9_]{0,63}$/u.test(value))
  );
}
export const PET_DIRECTIONS = [
  'front',
  'front-right',
  'right',
  'back-right',
  'back',
  'back-left',
  'left',
  'front-left',
] as const;
export type PetDirection = (typeof PET_DIRECTIONS)[number];
export interface PetClip {
  action: PetAction;
  skin: Skin;
  direction: string;
  fps: number;
  frameCount: number;
  loop: boolean;
  atlases: string[];
  duration?: number;
  frameDurationsMs?: number[];
  sourceAnimation?: string;
}
export interface PetSourceAction {
  action: PetAction;
  label: string;
  skins: Skin[];
  sourceName?: string;
  directionsBySkin?: Partial<Record<Skin, PetDirection[]>>;
}
export interface PetManifest {
  version: 2;
  render: 'sprite-sheet-2d';
  tileSize: number;
  columns: number;
  rows: number;
  framesPerAtlas: number;
  defaultSkin: Skin;
  defaultDirection: string;
  clips: Record<string, PetClip>;
  sourceActionsCatalog?: PetSourceAction[];
}
export const PET_ACTION_SECONDS: Readonly<Record<PetCoreAction, number>> = Object.freeze({
  idle: 12,
  walk: 4,
  run: 3,
  turn: 4,
  stretch: 8,
  groom: 8,
  pounce: 6,
  play: 10,
  feed: 8,
  happy: 8,
  sleep: 16,
  alert: 6,
  carry: 8,
});
export function petActionSeconds(action: PetAction): number {
  return PET_ACTION_SECONDS[action as PetCoreAction] ?? 6;
}
export function safePetAsset(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length < 240 &&
    /^atlases\/[a-zA-Z0-9_/-]+\.png$/u.test(path) &&
    !path.split('/').includes('..')
  );
}
export function validatePetManifest(input: unknown): PetManifest {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Mochi artwork manifest is missing.');
  const value = input as Record<string, unknown>;
  if (
    value.version !== 2 ||
    value.render !== 'sprite-sheet-2d' ||
    value.tileSize !== 256 ||
    value.columns !== 8 ||
    value.rows !== 4 ||
    value.framesPerAtlas !== 32 ||
    !value.clips ||
    typeof value.clips !== 'object' ||
    Array.isArray(value.clips)
  )
    throw new Error('Mochi artwork uses an unsupported atlas format.');
  const clips: Record<string, PetClip> = {};
  const entries = Object.entries(value.clips);
  if (!entries.length || entries.length > 4096)
    throw new Error('Mochi artwork has an invalid clip count.');
  for (const [key, raw] of entries) {
    if (!raw || typeof raw !== 'object') throw new Error('Mochi artwork contains an invalid clip.');
    const clip = raw as Record<string, unknown>;
    if (
      !isPetAction(clip.action) ||
      !PET_SKINS.includes(clip.skin as Skin) ||
      typeof clip.direction !== 'string' ||
      !PET_DIRECTIONS.includes(clip.direction as PetDirection) ||
      key !== `${clip.action}_${clip.skin}_${clip.direction}` ||
      typeof clip.fps !== 'number' ||
      !Number.isFinite(clip.fps) ||
      clip.fps < 0.5 ||
      clip.fps > 60 ||
      typeof clip.frameCount !== 'number' ||
      !Number.isInteger(clip.frameCount) ||
      clip.frameCount < 1 ||
      clip.frameCount > 1800 ||
      typeof clip.loop !== 'boolean' ||
      !Array.isArray(clip.atlases) ||
      clip.atlases.length !== Math.ceil(clip.frameCount / 32) ||
      !clip.atlases.every(safePetAsset) ||
      (clip.sourceAnimation !== undefined &&
        (typeof clip.sourceAnimation !== 'string' ||
          !clip.sourceAnimation.trim() ||
          clip.sourceAnimation.length > 120 ||
          /\p{Cc}/u.test(clip.sourceAnimation)))
    )
      throw new Error(`Mochi artwork clip ${key} is invalid.`);
    const holds = clip.frameDurationsMs;
    if (
      holds !== undefined &&
      (!Array.isArray(holds) ||
        holds.length !== clip.frameCount ||
        !holds.every(
          (ms) => typeof ms === 'number' && Number.isFinite(ms) && ms >= 16 && ms <= 120000,
        ) ||
        holds.reduce((sum: number, ms: number) => sum + ms, 0) > 600000)
    )
      throw new Error(`Mochi artwork clip ${key} has invalid frame holds.`);
    clips[key] = {
      action: clip.action as PetAction,
      skin: clip.skin as Skin,
      direction: clip.direction,
      fps: clip.fps,
      frameCount: clip.frameCount,
      loop: clip.loop,
      atlases: [...clip.atlases],
      ...(holds ? { frameDurationsMs: [...(holds as number[])] } : {}),
      ...(typeof clip.sourceAnimation === 'string'
        ? { sourceAnimation: clip.sourceAnimation }
        : {}),
    };
    clips[key].duration = petClipMilliseconds(clips[key]) / 1000;
  }
  const defaultSkin = PET_SKINS.includes(value.defaultSkin as Skin)
    ? (value.defaultSkin as Skin)
    : 'eevee';
  const defaultDirection = PET_DIRECTIONS.includes(value.defaultDirection as PetDirection)
    ? String(value.defaultDirection)
    : 'front';
  if (!clips[`idle_${defaultSkin}_${defaultDirection}`])
    throw new Error('Mochi artwork has no default idle clip.');
  let sourceActionsCatalog: PetSourceAction[] | undefined;
  if (value.sourceActionsCatalog !== undefined) {
    if (!Array.isArray(value.sourceActionsCatalog) || value.sourceActionsCatalog.length > 512)
      throw new Error('Mochi source animation catalog is invalid.');
    sourceActionsCatalog = value.sourceActionsCatalog.map((raw) => {
      if (!raw || typeof raw !== 'object')
        throw new Error('Mochi source animation catalog is invalid.');
      const entry = raw as Record<string, unknown>;
      if (
        !isPetAction(entry.action) ||
        typeof entry.label !== 'string' ||
        !entry.label.trim() ||
        entry.label.length > 120 ||
        !Array.isArray(entry.skins) ||
        !entry.skins.length ||
        !entry.skins.every((skin) => PET_SKINS.includes(skin as Skin)) ||
        (entry.sourceName !== undefined &&
          (typeof entry.sourceName !== 'string' || entry.sourceName.length > 120))
      )
        throw new Error('Mochi source animation catalog is invalid.');
      let directionsBySkin: Partial<Record<Skin, PetDirection[]>> | undefined;
      if (entry.directionsBySkin !== undefined) {
        if (
          !entry.directionsBySkin ||
          typeof entry.directionsBySkin !== 'object' ||
          Array.isArray(entry.directionsBySkin)
        )
          throw new Error('Mochi source animation directions are invalid.');
        directionsBySkin = {};
        for (const [skin, directions] of Object.entries(entry.directionsBySkin)) {
          if (
            !PET_SKINS.includes(skin as Skin) ||
            !entry.skins.includes(skin) ||
            !Array.isArray(directions) ||
            !directions.length ||
            directions.length > PET_DIRECTIONS.length ||
            !directions.every((direction) => PET_DIRECTIONS.includes(direction as PetDirection)) ||
            new Set(directions).size !== directions.length
          )
            throw new Error('Mochi source animation directions are invalid.');
          directionsBySkin[skin as Skin] = [...directions] as PetDirection[];
        }
      }
      return {
        action: entry.action,
        label: entry.label,
        skins: [...new Set(entry.skins)] as Skin[],
        ...(typeof entry.sourceName === 'string' ? { sourceName: entry.sourceName } : {}),
        ...(directionsBySkin ? { directionsBySkin } : {}),
      };
    });
  }
  return {
    version: 2,
    render: 'sprite-sheet-2d',
    tileSize: 256,
    columns: 8,
    rows: 4,
    framesPerAtlas: 32,
    defaultSkin,
    defaultDirection,
    clips,
    ...(sourceActionsCatalog ? { sourceActionsCatalog } : {}),
  };
}
export function petDirection(dx: number, dy: number): PetDirection {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1) return 'front';
  const index = Math.round(Math.atan2(dx, dy) / (Math.PI / 4));
  return PET_DIRECTIONS[(index + 8) % 8];
}
function directionDistance(a: string, b: string): number {
  const ai = PET_DIRECTIONS.indexOf(a as PetDirection),
    bi = PET_DIRECTIONS.indexOf(b as PetDirection);
  if (ai < 0 || bi < 0) return b === 'front' ? 0 : 8;
  const distance = Math.abs(ai - bi);
  return Math.min(distance, 8 - distance);
}
export function selectPetClip(
  manifest: PetManifest,
  action: PetAction,
  skin: Skin,
  direction = 'front',
): PetClip {
  for (const [wantedAction, wantedSkin] of [
    [action, skin],
    [action, manifest.defaultSkin],
    ['idle', skin],
    ['idle', manifest.defaultSkin],
  ] as const) {
    const exact = manifest.clips[`${wantedAction}_${wantedSkin}_${direction}`];
    if (exact) return exact;
    const candidates = Object.values(manifest.clips).filter(
      (clip) => clip.action === wantedAction && clip.skin === wantedSkin,
    );
    candidates.sort(
      (a, b) =>
        directionDistance(direction, a.direction) - directionDistance(direction, b.direction),
    );
    if (candidates[0]) return candidates[0];
  }
  throw new Error('Mochi artwork has no usable clip.');
}
export function petClipMilliseconds(clip: PetClip): number {
  return clip.frameDurationsMs
    ? clip.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)
    : (clip.frameCount * 1000) / clip.fps;
}
function elapsedClipTime(clip: PetClip, elapsedMilliseconds: number): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0);
  const duration = petClipMilliseconds(clip);
  return clip.loop ? elapsed % duration : Math.min(elapsed, duration);
}
export function clipFrameAt(
  clip: PetClip,
  elapsedMilliseconds: number,
): { frame: number; complete: boolean } {
  const elapsed = Math.max(0, Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds : 0);
  const complete = !clip.loop && elapsed >= petClipMilliseconds(clip);
  if (complete) return { frame: clip.frameCount - 1, complete: true };
  const time = elapsedClipTime(clip, elapsed);
  if (clip.frameDurationsMs) {
    let boundary = 0;
    for (let frame = 0; frame < clip.frameCount; frame++) {
      boundary += clip.frameDurationsMs[frame];
      if (time < boundary) return { frame, complete: false };
    }
    return { frame: clip.frameCount - 1, complete: false };
  }
  return {
    frame: Math.min(clip.frameCount - 1, Math.floor((time * clip.fps) / 1000)),
    complete: false,
  };
}
/** Wake only at the next source-frame boundary; null means a finished one-shot. */
export function clipFrameDelay(clip: PetClip, elapsedMilliseconds: number): number | null {
  const position = clipFrameAt(clip, elapsedMilliseconds);
  if (position.complete) return null;
  const time = elapsedClipTime(clip, elapsedMilliseconds);
  const boundary = clip.frameDurationsMs
    ? clip.frameDurationsMs.slice(0, position.frame + 1).reduce((sum, ms) => sum + ms, 0)
    : ((position.frame + 1) * 1000) / clip.fps;
  return Math.max(1, boundary - time);
}
export function petAtlasFrame(
  manifest: PetManifest,
  clip: PetClip,
  frame: number,
): { atlas: string; atlasIndex: number; column: number; row: number } {
  const safeFrame = Math.max(0, Math.min(clip.frameCount - 1, Math.floor(frame)));
  const atlasIndex = Math.floor(safeFrame / manifest.framesPerAtlas);
  const cell = safeFrame % manifest.framesPerAtlas;
  return {
    atlas: clip.atlases[atlasIndex],
    atlasIndex,
    column: cell % manifest.columns,
    row: Math.floor(cell / manifest.columns),
  };
}

export function cursorAmbushEligible(
  following: boolean,
  reducedMotion: boolean,
  lastAmbushAt: number,
  cursorAt: number,
  now = Date.now(),
  frequency: FollowCursorFrequency = 'sometimes',
): boolean {
  return (
    following &&
    frequency !== 'off' &&
    !reducedMotion &&
    Number.isFinite(lastAmbushAt) &&
    Number.isFinite(cursorAt) &&
    now - lastAmbushAt >= cursorFollowCooldown(frequency) &&
    now - cursorAt >= 0 &&
    now - cursorAt <= 6000
  );
}

export function cursorFollowCooldown(frequency: FollowCursorFrequency): number {
  return frequency === 'off'
    ? Infinity
    : frequency === 'rarely'
      ? 90000
      : frequency === 'often'
        ? 15000
        : 40000;
}
