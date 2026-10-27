import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
  isQuietHours,
  isRestrictedUrl,
  petDirection,
  petClipMilliseconds,
  selectPetClip,
  PET_ACTION_SECONDS,
  cursorAmbushEligible,
} from '@mochi/shared';
import type { PetManifest } from '@mochi/shared';
import { actionForMood } from './ui/Pet';
import { loadPetManifest, petAssetBase } from './ui/petAssets';
import { Pet } from './ui/Pet';
import type { Mood } from './ui/Pet';
import { CommandBox } from './ui/CommandBox';
import { ReminderDialogue } from './ui/ReminderDialogue';
import { MusicPlayer } from './ui/MusicPlayer';
import { useMochi } from './ui/useMochi';
import css from './ui/styles.css?inline';
const overlayCss = `
:host{all:initial;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;color:#453b50;font:14px/1.5 "Segoe UI",system-ui,sans-serif}
.overlay-stage{position:fixed;inset:0;pointer-events:none;overflow:hidden}.floating-pet{position:absolute;pointer-events:none;transition:transform 1.5s ease-in-out;will-change:auto}.floating-pet.dragging{transition:none}.pet-hit{pointer-events:auto;display:block;background:none!important;border:0;padding:0;touch-action:none;cursor:grab;position:relative;z-index:2}.pet-hit:active{cursor:grabbing;transform:none}.pet-bubble{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);white-space:nowrap;border:1px solid #e7ddec;background:#fffdfa;color:#8a719b;box-shadow:0 3px 15px #3e244410;padding:7px 11px;border-radius:13px;font-size:10px;pointer-events:none}.pet-panel{position:fixed;width:330px;max-width:calc(100vw - 24px);max-height:calc(100vh - 36px);overflow:auto;pointer-events:auto;padding:19px;background:#faf8f4;color:#51425e;border:1px solid #dfd2e8;border-radius:20px;box-shadow:0 10px 45px #3d254328;font:13px/1.5 "Segoe UI",system-ui,sans-serif}.pet-panel .wordmark{font-size:27px}.pet-panel h2{font-size:17px}.pet-panel .command-box{margin:12px 0}.pet-panel .command-box label{font-size:11px}.pet-panel .button-row{gap:6px}.pet-panel button{font-size:11px;padding:7px 10px}.pet-panel .section-top{margin-bottom:10px}.pet-panel .close{border:0;background:none;font-size:18px;padding:0 5px}.pet-panel .music-box{padding:12px;margin:12px 0}.pet-panel .music-box .track strong{font-size:12px}.pet-panel .command-input button{padding:0}.pet-panel .notice{margin:10px 0;font-size:11px}.pet-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}.pet-settings{border-top:1px solid #e6deec;margin-top:12px;padding-top:12px;display:flex;flex-wrap:wrap;gap:6px}.pet-menu-footer{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:10px;color:#8c7a98}.floating-pet.resting{transition:none!important}.floating-pet.resting *{animation-play-state:paused!important}.mochi-toy{position:fixed;width:15px;height:15px;border-radius:50%;background:#e4a6b7;border:2px solid #f6d3df;box-shadow:0 3px 5px #42354022;pointer-events:none;animation:mochi-toy-spin 1s ease-out}@keyframes mochi-toy-spin{from{transform:rotate(-120deg) translateY(-15px)}to{transform:rotate(120deg) translateY(0)}}
`;
export interface PetControlEdge {
  x: number;
  y: number;
}
/** Geometry only: no labels, text, values, clicks, focus, or page commands. */
export function samplePetControlEdges(limit = 40): PetControlEdge[] {
  const controls = document.querySelectorAll(
    'button,input:not([type="hidden"]):not([type="password"]),select,textarea,[contenteditable="true"]',
  );
  const edges: PetControlEdge[] = [];
  for (let i = 0; i < Math.min(40, Math.max(0, limit), controls.length); i++) {
    const rect = controls[i].getBoundingClientRect();
    if (
      rect.width < 12 ||
      rect.height < 12 ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth ||
      rect.top >= window.innerHeight
    )
      continue;
    edges.push({
      x: Math.min(window.innerWidth - 8, rect.right + 12),
      y: Math.max(8, rect.bottom - 8),
    });
  }
  return edges;
}
function Overlay() {
  const { data, windowId, error, notice, send, patch, pendingReminders } = useMochi();
  const reminderNotice =
    data?.settings.remindersEnabled && !isQuietHours(data.settings)
      ? pendingReminders[0]
      : undefined;
  const [reminderBusy, setReminderBusy] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 }),
    [open, setOpen] = useState(false),
    [mood, setMood] = useState<Mood>('idle');
  const [bubble, setBubble] = useState(''),
    [visible, setVisible] = useState(!document.hidden),
    [dragging, setDragging] = useState(false);
  const [direction, setDirection] = useState('front'),
    [travelSeconds, setTravelSeconds] = useState(0),
    [toy, setToy] = useState<{ x: number; y: number } | null>(null);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const dataRef = useRef(data);
  dataRef.current = data;
  const floating = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position),
    moodRef = useRef<Mood>('idle'),
    initialized = useRef(''),
    suppressClick = useRef(false);
  const drag = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const reaction = useRef<ReturnType<typeof setTimeout> | null>(null),
    poseEnd = useRef<(() => void) | null>(null);
  const manifest = useRef<PetManifest | null>(null),
    busyUntil = useRef(0),
    remaining = useRef(0),
    travel = useRef(false);
  const cursor = useRef<{ x: number; y: number; at: number } | null>(null),
    lastCursor = useRef(0),
    lastAmbush = useRef(Date.now()),
    lastExplore = useRef(Date.now());
  const size = data?.settings.size || 112,
    active = data?.settings.lifecycle === 'running' && visible;
  const activeRef = useRef(active);
  activeRef.current = active;
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  function clamp(p: { x: number; y: number }) {
    return {
      x: Math.max(8, Math.min(Math.max(8, window.innerWidth - size - 8), p.x)),
      y: Math.max(8, Math.min(Math.max(8, window.innerHeight - size - 8), p.y)),
    };
  }
  function move(p: { x: number; y: number }, avoidControls = true) {
    let next = clamp(p);
    if (avoidControls) {
      const under = document.elementFromPoint?.(next.x + size / 2, next.y + size / 2);
      if (under?.closest('input,textarea,select,[contenteditable="true"]'))
        next = clamp({ x: next.x, y: next.y - size - 14 });
    }
    const dx = next.x - positionRef.current.x,
      dy = next.y - positionRef.current.y;
    if (Math.hypot(dx, dy) > 3) {
      const heading = petDirection(dx, dy);
      directionRef.current = heading;
      setDirection(heading);
    }
    positionRef.current = next;
    setPosition(next);
  }
  function settleAtRenderedPosition() {
    const rect = floating.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      clearReaction();
      travel.current = false;
      busyUntil.current = 0;
      remaining.current = 0;
      setTravelSeconds(0);
      move({ x: rect.left, y: rect.top }, false);
    }
  }
  function savePosition() {
    void send({
      type: 'position',
      x: Math.max(
        0,
        Math.min(1, positionRef.current.x / Math.max(1, window.innerWidth - size - 16)),
      ),
      y: Math.max(
        0,
        Math.min(1, positionRef.current.y / Math.max(1, window.innerHeight - size - 16)),
      ),
    });
  }
  function clearReaction() {
    if (reaction.current) clearTimeout(reaction.current);
    reaction.current = null;
  }
  function duration(value: Mood): number {
    const action = actionForMood(value),
      skin = dataRef.current?.settings.skin || 'eevee';
    return manifest.current
      ? petClipMilliseconds(selectPetClip(manifest.current, action, skin, directionRef.current))
      : PET_ACTION_SECONDS[action] * 1000;
  }
  function finishPose() {
    reaction.current = null;
    poseEnd.current = null;
    travel.current = false;
    moodRef.current = 'idle';
    setMood('idle');
    setBubble('');
    setToy(null);
    busyUntil.current = Date.now();
  }
  function completePose() {
    reaction.current = null;
    travel.current = false;
    const next = poseEnd.current;
    poseEnd.current = null;
    if (next) next();
    else finishPose();
  }
  function pose(value: Mood, speech = '', milliseconds = duration(value), after?: () => void) {
    clearReaction();
    poseEnd.current = after || null;
    travel.current = false;
    moodRef.current = value;
    setMood(value);
    setBubble(speech);
    busyUntil.current = Date.now() + milliseconds;
    remaining.current = milliseconds;
    if (activeRef.current && !reducedRef.current)
      reaction.current = setTimeout(completePose, milliseconds);
  }
  function travelTo(target: { x: number; y: number }, value: Mood = 'walking', after?: () => void) {
    clearReaction();
    poseEnd.current = after || null;
    const destination = clamp(target),
      seconds = Math.max(
        1.8,
        Math.min(
          12,
          Math.hypot(destination.x - positionRef.current.x, destination.y - positionRef.current.y) /
            (value === 'run' ? 170 : 95),
        ),
      );
    travel.current = true;
    setTravelSeconds(seconds);
    moodRef.current = value;
    setMood(value);
    busyUntil.current = Date.now() + seconds * 1000;
    remaining.current = seconds * 1000;
    move(destination);
    savePosition();
    reaction.current = setTimeout(completePose, seconds * 1000);
  }
  useEffect(() => {
    void loadPetManifest(petAssetBase())
      .then((value) => {
        manifest.current = value;
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!data || initialized.current === windowId) return;
    initialized.current = windowId;
    const p = data.positions[windowId];
    move(
      p
        ? {
            x: p.x * Math.max(1, window.innerWidth - size - 16),
            y: p.y * Math.max(1, window.innerHeight - size - 16),
          }
        : { x: window.innerWidth - size - 35, y: window.innerHeight - size - 35 },
    );
  }, [data, windowId, size]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media?.matches ?? false);
    media?.addEventListener?.('change', change);
    function visibility() {
      if (document.hidden) {
        remaining.current = Math.max(0, busyUntil.current - Date.now());
        clearReaction();
      }
      setVisible(!document.hidden);
      if (!document.hidden) {
        initialized.current = '';
        void send({ type: 'get' });
        busyUntil.current = Date.now() + remaining.current;
      }
    }
    const resize = () => move(positionRef.current, false);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      media?.removeEventListener?.('change', change);
    };
  }, [size]);
  useEffect(() => () => clearReaction(), []);
  useEffect(() => {
    if (!active || dragging || open || reduced || reminderNotice) {
      clearReaction();
      return;
    }
    clearReaction();
    if (remaining.current > 0 && moodRef.current !== 'idle')
      reaction.current = setTimeout(finishPose, remaining.current);
    let timer: ReturnType<typeof setTimeout>;
    const decide = () => {
      const wait = busyUntil.current - Date.now();
      if (wait > 0) {
        timer = setTimeout(decide, wait + 1200);
        return;
      }
      const settings = dataRef.current?.settings,
        point = cursor.current;
      if (
        point &&
        cursorAmbushEligible(
          settings?.following === true,
          reducedRef.current,
          lastAmbush.current,
          point.at,
          Date.now(),
          settings?.followCursorFrequency || 'sometimes',
        ) &&
        Math.random() < 0.28
      ) {
        lastAmbush.current = Date.now();
        pose('curious', '', duration('curious'), () => {
          const approach = clamp({ x: point.x - size * 1.6, y: point.y - size * 0.9 });
          travelTo(approach, 'run', () => {
            setToy({ x: point.x, y: point.y });
            setTravelSeconds(Math.max(1.8, duration('pounce') / 1000));
            move({ x: point.x - size * 0.5, y: point.y - size * 0.8 }, false);
            pose('pounce', '');
            savePosition();
          });
        });
      } else if (
        settings?.wandering &&
        Date.now() - lastExplore.current >= 20000 &&
        Math.random() < 0.23
      ) {
        lastExplore.current = Date.now();
        const edges = samplePetControlEdges(40);
        if (edges.length) {
          const edge = edges[Math.floor(Math.random() * edges.length)];
          travelTo({ x: edge.x - size * 0.2, y: edge.y - size * 0.9 }, 'walking', () =>
            pose('exploring', ''),
          );
        } else pose('curious');
      } else if (settings?.wandering && Math.random() < 0.58) {
        travelTo({
          x: 8 + Math.random() * Math.max(1, window.innerWidth - size - 16),
          y: 8 + Math.random() * Math.max(1, window.innerHeight - size - 16),
        });
      } else {
        const poses: Mood[] = ['grooming', 'stretching', 'sleeping', 'curious', 'idle'];
        pose(poses[Math.floor(Math.random() * poses.length)]);
      }
      timer = setTimeout(
        decide,
        Math.max(1000, busyUntil.current - Date.now()) + 3500 + Math.random() * 6500,
      );
    };
    timer = setTimeout(
      decide,
      Math.max(12000, busyUntil.current - Date.now()) + 1000 + Math.random() * 2000,
    );
    return () => {
      clearTimeout(timer);
      clearReaction();
    };
  }, [
    active,
    dragging,
    open,
    reduced,
    data?.settings.wandering,
    data?.settings.following,
    data?.settings.followCursorFrequency,
    reminderNotice?.deliveryId,
  ]);
  useEffect(() => {
    if (
      !active ||
      !data?.settings.following ||
      data.settings.followCursorFrequency === 'off' ||
      dragging ||
      open ||
      reduced ||
      reminderNotice
    )
      return;
    const pointer = (event: PointerEvent) => {
      if (!event.isTrusted || Date.now() - lastCursor.current < 300) return;
      lastCursor.current = Date.now();
      cursor.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    };
    document.addEventListener('pointermove', pointer, { passive: true });
    return () => document.removeEventListener('pointermove', pointer);
  }, [
    active,
    data?.settings.following,
    data?.settings.followCursorFrequency,
    dragging,
    open,
    reduced,
    reminderNotice?.deliveryId,
  ]);
  useEffect(() => {
    const listener = (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'mochi-summon') {
        setOpen(false);
        setTravelSeconds(0);
        void send({ type: 'get' });
        move({ x: window.innerWidth * 0.5 - size / 2, y: window.innerHeight * 0.65 });
        pose('happy', 'Here I am. A little company?');
        savePosition();
      } else if (message.type === 'mochi-notification') {
        void send({ type: 'get' });
        pose('notification', 'A gentle reminder for you.');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [size]);
  useEffect(() => {
    if (!reminderNotice) {
      if (busyUntil.current === Infinity) finishPose();
      return;
    }
    if (!visible || data?.settings.lifecycle === 'disabled') return;
    clearReaction();
    setOpen(false);
    setTravelSeconds(0);
    setMood('notification');
    move({ x: window.innerWidth * 0.5 - size / 2, y: window.innerHeight * 0.68 }, false);
    busyUntil.current = Infinity;
    remaining.current = 0;
    savePosition();
  }, [reminderNotice?.deliveryId, visible, size]);
  async function handleReminder(action: 'snooze' | 'dismiss') {
    if (!reminderNotice || reminderBusy) return;
    setReminderBusy(true);
    try {
      await send({
        type: 'reminder-action',
        id: reminderNotice.reminderId,
        deliveryId: reminderNotice.deliveryId,
        action,
        ...(action === 'snooze' ? { minutes: 5 } : {}),
      });
    } finally {
      setReminderBusy(false);
      busyUntil.current = Date.now();
    }
  }
  function clipReady(clip: import('@mochi/shared').PetClip) {
    if (
      travel.current ||
      clip.action !== actionForMood(moodRef.current) ||
      !activeRef.current ||
      reducedRef.current
    )
      return;
    const milliseconds = petClipMilliseconds(clip);
    busyUntil.current = Date.now() + milliseconds;
    remaining.current = milliseconds;
    if (reaction.current) clearTimeout(reaction.current);
    if (moodRef.current !== 'idle') reaction.current = setTimeout(completePose, milliseconds);
  }
  function interact(action: 'pet' | 'feed' | 'play') {
    if (action === 'play') {
      setOpen(false);
      const target = clamp({
        x: positionRef.current.x + (directionRef.current.includes('left') ? -180 : 180),
        y: positionRef.current.y + (Math.random() - 0.5) * 100,
      });
      setToy({ x: target.x + size * 0.7, y: target.y + size * 0.8 });
      if (!reduced) {
        setTravelSeconds(duration('play') / 1000);
        move(target);
        savePosition();
      }
    }
    pose(
      action === 'feed' ? 'feed' : action === 'play' ? 'play' : 'happy',
      action === 'feed'
        ? 'Snack accepted. You are my favorite.'
        : action === 'play'
          ? 'One tiny adventure, please.'
          : 'Prrr. Right where I belong.',
    );
    if (data?.settings.sound && !isQuietHours(data.settings)) {
      try {
        const context = new AudioContext(),
          oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.frequency.value = action === 'feed' ? 660 : 523;
        gain.gain.setValueAtTime(0.035, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
        oscillator.onended = () => void context.close();
      } catch {
        /* Explicit optional sound may be unavailable. */
      }
    }
  }
  if (
    !data ||
    data.settings.lifecycle === 'disabled' ||
    (data.settings.lifecycle === 'hidden' && !reminderNotice)
  )
    return null;
  const s = data.settings;
  const panelLeft = Math.max(
    12,
    Math.min(
      window.innerWidth - 342,
      position.x > window.innerWidth / 2 ? position.x - 245 : position.x,
    ),
  );
  const panelTop = Math.max(12, Math.min(window.innerHeight - 430, position.y - 390));
  const upcoming = data.reminders
    .filter((r) => !r.completed && !r.paused)
    .sort((a, b) => a.dueAt - b.dueAt)[0];
  const youtube = data.history.find((h) =>
    ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(new URL(h.url).hostname),
  );
  return (
    <div
      className="overlay-stage"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <div
        ref={floating}
        className={`floating-pet ${dragging ? 'dragging' : ''} ${!active ? 'resting' : ''}`}
        style={{
          transform: `translate(${position.x}px,${position.y}px)`,
          opacity: s.opacity,
          transitionDuration: `${travelSeconds}s`,
        }}
      >
        {!reminderNotice && s.bubble && (bubble || s.lifecycle === 'paused') && !open && (
          <span className="pet-bubble">
            {s.lifecycle === 'paused' ? 'A small rest. Resume from my menu.' : bubble}
          </span>
        )}
        <button
          className="pet-hit"
          aria-label="Pet Mochi. Drag to carry. Right-click or press Shift+F10 for controls."
          aria-expanded={open}
          onContextMenu={(e) => {
            if (!e.isTrusted) return;
            e.preventDefault();
            settleAtRenderedPosition();
            setOpen(!open);
          }}
          onKeyDown={(e) => {
            if (e.isTrusted && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
              e.preventDefault();
              settleAtRenderedPosition();
              setOpen(true);
            }
          }}
          onPointerDown={(e) => {
            if (!e.isTrusted) return;
            suppressClick.current = false;
            const rect = e.currentTarget.getBoundingClientRect();
            setDragging(true);
            setMood('dragged');
            setTravelSeconds(0);
            clearReaction();
            busyUntil.current = 0;
            remaining.current = 0;
            travel.current = false;
            moodRef.current = 'dragged';
            move({ x: rect.left, y: rect.top }, false);
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              startX: e.clientX,
              startY: e.clientY,
              x: rect.left,
              y: rect.top,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !e.isTrusted) return;
            if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 5) {
              d.moved = true;
              setDragging(true);
              setMood('dragged');
              move({ x: d.x + e.clientX - d.startX, y: d.y + e.clientY - d.startY }, false);
            }
          }}
          onPointerUp={(e) => {
            if (!e.isTrusted) return;
            const d = drag.current;
            if (d?.moved) {
              suppressClick.current = true;
              savePosition();
              setMood('idle');
            }
            drag.current = null;
            setDragging(false);
            moodRef.current = 'idle';
            remaining.current = 0;
            setMood('idle');
          }}
          onPointerCancel={(e) => {
            if (!e.isTrusted) return;
            drag.current = null;
            setDragging(false);
            moodRef.current = 'idle';
            remaining.current = 0;
            setMood('idle');
          }}
          onClick={(e) => {
            if (!e.isTrusted) return;
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            if (dragging) return;
            interact('pet');
          }}
        >
          <Pet
            skin={s.skin}
            size={size}
            mood={s.lifecycle === 'paused' ? 'sleeping' : mood}
            paused={s.lifecycle !== 'running'}
            direction={direction}
            onClipReady={clipReady}
          />
        </button>
      </div>
      {reminderNotice && visible && (
        <div
          className="reminder-dialogue-position"
          style={{
            position: 'fixed',
            pointerEvents: 'auto',
            left: Math.max(12, Math.min(window.innerWidth - 344, position.x + size / 2 - 160)),
            top: Math.max(12, Math.min(window.innerHeight - 240, position.y - 210)),
          }}
        >
          <ReminderDialogue
            notice={reminderNotice}
            count={pendingReminders.length}
            busy={reminderBusy}
            error={error}
            trustedOnly
            onSnooze={() => void handleReminder('snooze')}
            onDismiss={() => void handleReminder('dismiss')}
          />
        </div>
      )}
      {toy && <span className="mochi-toy" aria-hidden="true" style={{ left: toy.x, top: toy.y }} />}
      {open && (
        <section
          className="pet-panel"
          aria-label="Mochi companion menu"
          style={{ left: panelLeft, top: panelTop }}
        >
          <div className="section-top">
            <span className="wordmark">mochi</span>
            <button
              className="close"
              aria-label="Close menu"
              onClick={(e) => {
                if (e.isTrusted) setOpen(false);
              }}
            >
              &times;
            </button>
          </div>
          <div className="pet-actions">
            {(['pet', 'feed', 'play'] as const).map((action) => (
              <button
                key={action}
                onClick={(e) => {
                  if (e.isTrusted) interact(action);
                }}
              >
                {action === 'pet' ? 'Pet' : action === 'feed' ? 'Feed' : 'Play'}
              </button>
            ))}
          </div>
          <CommandBox
            shortcuts={s.shortcuts}
            run={async (text) => {
              setMood('thinking');
              const ok = await send({ type: 'command', text });
              setMood(ok ? 'happy' : 'curious');
              return ok;
            }}
          />
          {(notice || error) && (
            <p role="status" className="notice">
              {error || notice}
            </p>
          )}
          <button
            onClick={(e) => {
              if (e.isTrusted)
                void send({ type: 'command', text: 'remind me about this page in 30 minutes' });
            }}
          >
            Remember this page · 30 min
          </button>
          {!s.compact && <MusicPlayer lastUrl={youtube?.url} />}
          <div className="button-row">
            <button
              aria-pressed={s.following}
              onClick={(e) => {
                if (e.isTrusted) void patch({ following: !s.following });
              }}
            >
              {s.following ? 'Stop following' : 'Follow cursor'}
            </button>
            <button
              aria-pressed={s.wandering}
              onClick={(e) => {
                if (e.isTrusted) void patch({ wandering: !s.wandering });
              }}
            >
              {s.wandering ? 'Stop wandering' : 'Wander'}
            </button>
          </div>
          {upcoming && (
            <p className="fine">
              Next: {upcoming.title}
              <br />
              <button
                onClick={(e) => {
                  if (e.isTrusted)
                    void send({
                      type: 'reminder-action',
                      id: upcoming.id,
                      action: 'snooze',
                      minutes: 10,
                    });
                }}
              >
                Snooze 10 minutes
              </button>
            </p>
          )}
          <div className="pet-settings">
            <button
              onClick={(e) => {
                if (e.isTrusted)
                  void patch({ lifecycle: s.lifecycle === 'paused' ? 'running' : 'paused' });
              }}
            >
              {s.lifecycle === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={(e) => {
                if (e.isTrusted) void patch({ lifecycle: 'hidden' });
              }}
            >
              Hide
            </button>
            <button
              onClick={(e) => {
                if (e.isTrusted) void send({ type: 'open-settings' });
              }}
            >
              Settings
            </button>
            <button
              className="danger-text"
              onClick={(e) => {
                if (e.isTrusted) void patch({ lifecycle: 'disabled' });
              }}
            >
              Shut down
            </button>
          </div>
          <div className="pet-menu-footer">
            <span>Drag Mochi to move</span>
            <span>Escape to close</span>
          </div>
        </section>
      )}
    </div>
  );
}
const ROOT_ID = 'mochi-companion-v1';

export function mountContent(): () => void {
  if (isRestrictedUrl(location.href) || document.getElementById(ROOT_ID)) return () => {};
  const host = document.createElement('div');
  host.id = ROOT_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css + overlayCss;
  const mount = document.createElement('div');
  shadow.append(style, mount);
  document.documentElement.append(host);
  const root: Root = createRoot(mount);
  root.render(<Overlay />);
  let disposed = false;
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) cleanup();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('pagehide', onPageHide);
    root.unmount();
    host.remove();
  };
  window.addEventListener('pagehide', onPageHide);
  return cleanup;
}
if (typeof chrome !== 'undefined' && chrome.runtime?.id) mountContent();
