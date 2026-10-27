import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  clipFrameAt,
  clipFrameDelay,
  petAtlasFrame,
  petClipMilliseconds,
  petActionSeconds,
  selectPetClip,
} from '@mochi/shared';
import type { PetAction, PetCoreAction, PetClip, PetManifest, Skin } from '@mochi/shared';
import {
  loadPetManifest,
  petAssetBase,
  petAtlasCache,
  releasePetAtlasCache,
  retainPetAtlasPlayer,
} from './petAssets';

export type Mood =
  | 'idle'
  | 'blink'
  | 'happy'
  | 'curious'
  | 'walking'
  | 'following'
  | 'listening'
  | 'thinking'
  | 'music'
  | 'sleeping'
  | 'notification'
  | 'dragged'
  | 'grooming'
  | 'stretching'
  | 'pounce'
  | 'hidden'
  | 'feed'
  | 'play'
  | 'run'
  | 'turn'
  | 'exploring';
const moodActions: Record<Mood, PetCoreAction> = {
  idle: 'idle',
  blink: 'idle',
  happy: 'happy',
  curious: 'turn',
  walking: 'walk',
  following: 'run',
  listening: 'alert',
  thinking: 'turn',
  music: 'play',
  sleeping: 'sleep',
  notification: 'alert',
  dragged: 'carry',
  grooming: 'groom',
  stretching: 'stretch',
  pounce: 'pounce',
  hidden: 'idle',
  feed: 'feed',
  play: 'play',
  run: 'run',
  turn: 'turn',
  exploring: 'play',
};
export function actionForMood(mood: Mood): PetCoreAction {
  return moodActions[mood];
}
const protectedActions = new Set<PetAction>([
  'turn',
  'stretch',
  'groom',
  'pounce',
  'play',
  'feed',
  'happy',
  'alert',
]);
export interface PetProps {
  skin?: Skin;
  mood?: Mood;
  actionOverride?: PetAction;
  size?: number;
  paused?: boolean;
  direction?: string;
  assetBase?: string;
  animated?: boolean;
  onComplete?: (action: PetAction) => void;
  onClipReady?: (clip: PetClip) => void;
  /** Compatibility input selects a drawn left/right heading; artwork is never mirrored. */
  facing?: 1 | -1;
}
export function Pet({
  skin = 'eevee',
  mood = 'idle',
  actionOverride,
  size = 112,
  paused = false,
  direction,
  facing,
  assetBase,
  animated = true,
  onComplete,
  onClipReady,
}: PetProps) {
  const element = useRef<HTMLSpanElement>(null),
    transitionFrame = useRef<HTMLSpanElement>(null);
  const base = petAssetBase(assetBase);
  const wantedAction = actionOverride ?? actionForMood(mood);
  const isHidden = mood === 'hidden';
  const [action, setAction] = useState<PetAction>(wantedAction);
  const [knownManifest, setKnownManifest] = useState<PetManifest | null>(null);
  const callbacks = useRef({ onComplete, onClipReady });
  callbacks.current = { onComplete, onClipReady };
  const lockUntil = useRef(0),
    currentAction = useRef(action),
    pendingIdle = useRef(false);
  const heading = direction || (facing === -1 ? 'left' : facing === 1 ? 'right' : 'front');
  const renderedHeading = knownManifest
    ? selectPetClip(knownManifest, action, skin, heading).direction
    : heading;
  useEffect(() => {
    if (
      wantedAction === 'idle' &&
      (protectedActions.has(currentAction.current) || currentAction.current.startsWith('pmd_')) &&
      performance.now() < lockUntil.current &&
      animated &&
      !paused
    ) {
      pendingIdle.current = true;
      return;
    }
    pendingIdle.current = false;
    currentAction.current = wantedAction;
    lockUntil.current = performance.now() + petActionSeconds(wantedAction) * 1000;
    setAction(wantedAction);
  }, [wantedAction, animated, paused]);
  useEffect(() => {
    const releasePlayer = animated && !paused && !isHidden ? retainPetAtlasPlayer() : () => {};
    const target = element.current;
    if (!target) {
      releasePlayer();
      return;
    }
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const clearTransition = () => {
      if (transitionFrame.current) {
        transitionFrame.current.style.opacity = '0';
        transitionFrame.current.style.backgroundImage = '';
      }
    };
    clearTransition();
    let elapsed = 0,
      started = performance.now(),
      running = false,
      completed = false;
    let clip: PetClip | undefined,
      paintGeneration = 0,
      currentAtlas = '',
      preparedAtlas = '',
      preparingAtlas = '';
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const poster = `${base}posters/${skin}.png`;
    const showPoster = () => {
      target.style.backgroundImage = `url("${poster}")`;
      target.style.backgroundSize = '100% 100%';
      target.style.backgroundPosition = '0px 0px';
    };
    showPoster();
    target.dataset.petStatus = 'poster';
    let inView = true;
    const canPlay = () =>
      animated && !paused && !document.hidden && !media?.matches && !isHidden && inView;
    let startPlayback: (() => void) | undefined;
    const stop = () => {
      if (running) elapsed += Math.max(0, performance.now() - started);
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      ++paintGeneration;
      preparedAtlas = preparingAtlas = '';
    };
    const visibility = () => {
      if (!canPlay()) {
        stop();
        clearTransition();
        showPoster();
        if (document.hidden) releasePetAtlasCache();
      } else startPlayback?.();
    };
    const intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.find((item) => item.target === target);
              if (entry) {
                inView = entry.isIntersecting;
                visibility();
              }
            },
            { threshold: 0 },
          );
    intersection?.observe(target);
    document.addEventListener('visibilitychange', visibility);
    media?.addEventListener?.('change', visibility);
    if (animated && !paused && !isHidden) {
      target.dataset.petStatus = 'loading';
      void loadPetManifest(base)
        .then((manifest) => {
          if (disposed) return;
          setKnownManifest(manifest);
          clip = selectPetClip(manifest, action, skin, heading);
          target.dataset.petAction = clip.action;
          target.dataset.petDirection = clip.direction;
          callbacks.current.onClipReady?.(clip);
          if (protectedActions.has(action) || action.startsWith('pmd_'))
            lockUntil.current = performance.now() + petClipMilliseconds(clip);
          const draw = (frame: number) => {
            const atlasFrame = petAtlasFrame(manifest, clip!, frame);
            const url = base + atlasFrame.atlas;
            const generation = ++paintGeneration;
            void petAtlasCache
              .load(url)
              .then(() => {
                if (disposed || (!running && !completed) || generation !== paintGeneration) return;
                if (currentAtlas !== url) {
                  target.style.backgroundImage = `url("${url}")`;
                  currentAtlas = url;
                }
                target.style.backgroundSize = `${manifest.columns * size}px ${manifest.rows * size}px`;
                target.style.backgroundPosition = `${-atlasFrame.column * size}px ${-atlasFrame.row * size}px`;
                target.dataset.petFrame = String(frame);
                target.dataset.petDrawSize = String(size);
                target.dataset.petStatus = completed && !clip!.loop ? 'complete' : 'playing';
              })
              .catch(() => {
                if (!disposed) {
                  target.dataset.petStatus = 'unavailable';
                  stop();
                  clearTransition();
                  showPoster();
                }
              });
            if (frame % manifest.framesPerAtlas >= manifest.framesPerAtlas - 8) {
              const next = atlasFrame.atlasIndex + 1;
              if (next < clip!.atlases.length)
                void petAtlasCache.load(base + clip!.atlases[next]).catch(() => undefined);
            }
          };
          const tick = () => {
            if (!running || disposed || !clip) return;
            const time = elapsed + Math.max(0, performance.now() - started);
            const position = clipFrameAt(clip, time);
            draw(position.frame);
            if (!completed && time >= petClipMilliseconds(clip)) {
              completed = true;
              callbacks.current.onComplete?.(clip.action);
              if (pendingIdle.current) {
                pendingIdle.current = false;
                currentAction.current = 'idle';
                setAction('idle');
              }
            }
            if (position.complete || (clip.frameCount === 1 && completed)) {
              running = false;
              target.dataset.petStatus = clip.loop ? 'playing' : 'complete';
              return;
            }
            timer = setTimeout(tick, clipFrameDelay(clip, time) ?? 1);
          };
          startPlayback = () => {
            if (disposed || running || !canPlay() || (completed && !clip!.loop)) return;
            const first = petAtlasFrame(manifest, clip!, clipFrameAt(clip!, elapsed).frame);
            const needed = base + first.atlas;
            if (preparedAtlas !== needed) {
              if (preparingAtlas === needed) return;
              const generation = ++paintGeneration;
              preparingAtlas = needed;
              void petAtlasCache
                .load(needed)
                .then(() => {
                  if (disposed || generation !== paintGeneration) return;
                  preparingAtlas = '';
                  preparedAtlas = needed;
                  startPlayback?.();
                })
                .catch(() => {
                  if (disposed || generation !== paintGeneration) return;
                  target.dataset.petStatus = 'unavailable';
                  stop();
                  showPoster();
                });
              return;
            }
            // A short source action must begin after its first image is
            // decoded, rather than consuming its holds during image I/O.
            started = performance.now();
            if ((protectedActions.has(action) || action.startsWith('pmd_')) && !completed)
              lockUntil.current = started + Math.max(0, petClipMilliseconds(clip!) - elapsed);
            running = true;
            currentAtlas = '';
            tick();
          };
          startPlayback();
        })
        .catch(() => {
          if (!disposed) {
            target.dataset.petStatus = 'unavailable';
            clearTransition();
            showPoster();
          }
        });
    }
    return () => {
      disposed = true;
      stop();
      releasePlayer();
      clearTransition();
      document.removeEventListener('visibilitychange', visibility);
      media?.removeEventListener?.('change', visibility);
      intersection?.disconnect();
    };
  }, [action, skin, renderedHeading, size, base, paused, animated, isHidden]);
  return (
    <span
      ref={element}
      className={`mochi-art mochi-sprite mood-${mood} ${paused || !animated ? 'is-paused' : ''}`}
      data-skin={skin}
      data-pet-action={action}
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          display: mood === 'hidden' ? 'none' : 'inline-block',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
        } as CSSProperties
      }
    >
      <span
        ref={transitionFrame}
        className="pet-transition-frame"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          opacity: 0,
        }}
      />
    </span>
  );
}
