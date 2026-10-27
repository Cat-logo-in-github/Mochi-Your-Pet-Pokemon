// @vitest-environment jsdom
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultData, type AppData } from '@mochi/shared';
const client = vi.hoisted(() => ({ request: vi.fn(), subscribe: vi.fn() }));
vi.mock('../apps/extension/src/client', () => client);
import { mountContent, samplePetControlEdges } from '../apps/extension/src/content';

let data: AppData;
let shadows: ShadowRoot[];
let removeSubscription: ReturnType<typeof vi.fn>;
let cleanupMounted: (() => void) | undefined;
let addRuntimeListener: ReturnType<typeof vi.fn>;
let removeRuntimeListener: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  data = createDefaultData();
  shadows = [];
  removeSubscription = vi.fn();
  addRuntimeListener = vi.fn();
  removeRuntimeListener = vi.fn();
  client.request.mockReset();
  client.subscribe.mockReset();
  client.request.mockImplementation(async () => ({
    ok: true,
    data: structuredClone(data),
    google: null,
    windowId: '1',
  }));
  client.subscribe.mockReturnValue(removeSubscription);
  vi.stubGlobal('location', { href: 'https://example.com/' });
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://mochi-test/${path}`,
      onMessage: { addListener: addRuntimeListener, removeListener: removeRuntimeListener },
    },
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 900 });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
  });
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    options: ShadowRootInit,
  ) {
    const shadow = attach.call(this, options);
    shadows.push(shadow);
    return shadow;
  });
});
afterEach(async () => {
  await act(async () => {
    cleanupMounted?.();
  });
  cleanupMounted = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.getElementById('mochi-companion-v1')?.remove();
  document.body.replaceChildren();
});
async function mount() {
  await act(async () => {
    cleanupMounted = mountContent();
  });
  return document.getElementById('mochi-companion-v1');
}

function targetPosition(): { x: number; y: number } {
  const pet = shadows[0].querySelector('.floating-pet') as HTMLElement;
  const match = /translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/u.exec(pet.style.transform);
  if (!match) throw new Error('Mochi has no bounded screen position.');
  return { x: Number(match[1]), y: Number(match[2]) };
}
function expectInsideViewport() {
  const position = targetPosition();
  expect(position.x).toBeGreaterThanOrEqual(8);
  expect(position.x).toBeLessThanOrEqual(window.innerWidth - data.settings.size - 8);
  expect(position.y).toBeGreaterThanOrEqual(8);
  expect(position.y).toBeLessThanOrEqual(window.innerHeight - data.settings.size * 0.9 - 8);
}

describe('content overlay lifecycle and privilege isolation', () => {
  it('mounts a single closed shadow root with pointer-transparent outer surfaces', async () => {
    const host = await mount();
    expect(host).toBeTruthy();
    expect(host?.shadowRoot).toBeNull();
    expect(Element.prototype.attachShadow).toHaveBeenCalledWith({ mode: 'closed' });
    expect(shadows).toHaveLength(1);
    expect(shadows[0].querySelector('.pet-hit')?.getAttribute('aria-label')).toContain('Mochi');
    expect(shadows[0].querySelector('style')?.textContent).toContain('pointer-events:none');
    expect(client.request).toHaveBeenCalledExactlyOnceWith({ type: 'get' });
  });

  it('initializes idempotently and leaves the active instance alone after duplicate initialization', async () => {
    await mount();
    const duplicateCleanup = mountContent();
    expect(document.querySelectorAll('#mochi-companion-v1')).toHaveLength(1);
    expect(client.request).toHaveBeenCalledTimes(1);
    duplicateCleanup();
    expect(document.getElementById('mochi-companion-v1')).toBeTruthy();
  });

  it.each([
    'chrome://settings',
    'edge://extensions',
    'https://chromewebstore.google.com/detail/example',
    'https://microsoftedge.microsoft.com/addons/detail/example',
  ])('does not initialize on a restricted page: %s', async (url) => {
    vi.stubGlobal('location', { href: url });
    expect(await mount()).toBeNull();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('refuses synthetic page gestures before they can open privileged pet controls', async () => {
    await mount();
    const pet = shadows[0].querySelector('.pet-hit') as HTMLButtonElement;
    await act(async () => {
      fireEvent.pointerDown(pet, { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(pet, { clientX: 300, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(pet, { clientX: 300, clientY: 200, pointerId: 1 });
      fireEvent.click(pet);
    });
    expect(pet.getAttribute('aria-expanded')).toBe('false');
    expect(shadows[0].querySelector('.pet-panel')).toBeNull();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it.each(['hidden', 'disabled'] as const)(
    'preserves a transparent root while the pet is %s',
    async (lifecycle) => {
      data.settings.lifecycle = lifecycle;
      await mount();
      expect(shadows[0].querySelector('.pet-hit')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('pauses animation while preserving a visible menu control', async () => {
    data.settings.lifecycle = 'paused';
    await mount();
    expect(shadows[0].querySelector('.pet-hit')).toBeTruthy();
    expect(shadows[0].querySelector('.floating-pet')?.classList.contains('resting')).toBe(true);
    expect(shadows[0].querySelector('.mochi-art')?.classList.contains('is-paused')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops movement while the document is hidden and cancels its pending work', async () => {
    await mount();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shadows[0].querySelector('.floating-pet')?.classList.contains('resting')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('takes a real stroll across the available page instead of shuffling near its starting corner', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await mount();
    const initial = targetPosition();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    const destination = targetPosition();
    expect(Math.hypot(destination.x - initial.x, destination.y - initial.y)).toBeGreaterThan(300);
    expectInsideViewport();
    expect(client.request.mock.calls.some(([message]) => message.type === 'position')).toBe(true);
  });

  it('keeps roaming targets inside the viewport and clamps them immediately after a resize', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await mount();
    for (let step = 0; step < 8; step++) {
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
      expectInsideViewport();
    }
    window.innerWidth = 480;
    window.innerHeight = 360;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });
    expectInsideViewport();
  });

  it('returns to the latest per-window position when another tab has moved Mochi', async () => {
    data.settings.wandering = false;
    data.positions['1'] = { x: 0.9, y: 0.9 };
    await mount();
    const oldPosition = targetPosition();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    data.positions['1'] = { x: 0.12, y: 0.22 };
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const restored = targetPosition();
    expect(restored.x).toBeCloseTo(0.12 * (window.innerWidth - data.settings.size - 16));
    expect(restored.y).toBeCloseTo(0.22 * (window.innerHeight - data.settings.size - 16));
    expect(restored.x).toBeLessThan(oldPosition.x);
    expect(client.request.mock.calls.filter(([message]) => message.type === 'get')).toHaveLength(2);
  });

  it('does no movement work during a long stay in a hidden tab', async () => {
    await mount();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const initial = targetPosition();
    const requests = client.request.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(targetPosition()).toEqual(initial);
    expect(client.request).toHaveBeenCalledTimes(requests);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes its idle pose when an occurrence is acknowledged in another window', async () => {
    data.settings.wandering = false;
    let unread = [
      {
        deliveryId: 'delivery-one',
        reminderId: 'reminder-one',
        title: 'A readable reminder',
        dueAt: Date.now(),
        timeZone: 'UTC',
      },
    ];
    client.request.mockImplementation(async () => ({
      ok: true,
      data: structuredClone(data),
      google: null,
      windowId: '1',
      pendingReminders: unread,
    }));
    await mount();
    expect(shadows[0].querySelector('.reminder-dialogue-title')?.textContent).toBe(
      'A readable reminder',
    );
    expect(shadows[0].querySelector('.mochi-art')?.classList.contains('mood-notification')).toBe(
      true,
    );
    const refreshUnread = client.subscribe.mock.calls[0][1] as () => void;
    await act(async () => {
      unread = [];
      refreshUnread();
    });
    expect(shadows[0].querySelector('.reminder-dialogue')).toBeNull();
    expect(shadows[0].querySelector('.mochi-art')?.classList.contains('mood-idle')).toBe(true);
  });

  it.each([
    ['mochi-summon', 'happy', 'Here I am. A little company?', 8000],
    ['mochi-notification', 'notification', 'A gentle reminder for you.', 6000],
  ])(
    'reacts briefly to %s without opening a boxed controller',
    async (type, mood, speech, duration) => {
      data.settings.wandering = false;
      await mount();
      const before = targetPosition();
      const listener = addRuntimeListener.mock.calls.at(-1)![0] as (message: unknown) => void;
      await act(async () => {
        listener({ type, title: 'Untrusted remote text is ignored' });
      });
      expect(shadows[0].querySelector('.mochi-art')?.classList.contains(`mood-${mood}`)).toBe(true);
      expect(shadows[0].querySelector('.pet-bubble')?.textContent).toBe(speech);
      expect(shadows[0].querySelector('.pet-panel')).toBeNull();
      if (type === 'mochi-summon') {
        expect(targetPosition().x).toBe(window.innerWidth * 0.5 - data.settings.size / 2);
        expect(targetPosition().y).toBe(window.innerHeight * 0.65);
        expect(client.request.mock.calls.some(([message]) => message.type === 'position')).toBe(
          true,
        );
      } else expect(targetPosition()).toEqual(before);
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(shadows[0].querySelector('.mochi-art')?.classList.contains(`mood-${mood}`)).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(Number(duration) - 3000 + 1);
      });
      expect(shadows[0].querySelector('.mochi-art')?.classList.contains('mood-idle')).toBe(true);
      expect(shadows[0].querySelector('.pet-bubble')).toBeNull();
    },
  );

  it('samples at most forty visible control rectangles without reading their content or invoking them', () => {
    const geometry = vi.fn(
      () => ({ left: 100, top: 100, right: 180, bottom: 132, width: 80, height: 32 }) as DOMRect,
    );
    const clicked = vi.fn(),
      focused = vi.fn();
    for (let i = 0; i < 60; i++) {
      const control = document.createElement('button');
      Object.defineProperty(control, 'textContent', {
        get() {
          throw new Error('Host content must not be read.');
        },
      });
      control.getBoundingClientRect = geometry;
      control.onclick = clicked;
      control.onfocus = focused;
      document.body.append(control);
    }
    expect(samplePetControlEdges()).toHaveLength(40);
    expect(geometry).toHaveBeenCalledTimes(40);
    expect(clicked).not.toHaveBeenCalled();
    expect(focused).not.toHaveBeenCalled();
  });

  it('pads toward a sampled UI edge and plays its paw gesture without clicking or focusing the host control', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const control = document.createElement('button'),
      clicked = vi.fn(),
      focused = vi.fn();
    const geometry = vi.fn(
      () => ({ left: 100, top: 100, right: 180, bottom: 132, width: 80, height: 32 }) as DOMRect,
    );
    control.getBoundingClientRect = geometry;
    control.onclick = clicked;
    control.onfocus = focused;
    document.body.append(control);
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(32000);
    });
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(shadows[0].querySelector('.mochi-art')?.classList.contains('mood-exploring')).toBe(true);
    expect(clicked).not.toHaveBeenCalled();
    expect(focused).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(control);
    expectInsideViewport();
  });

  it('excludes hidden and offscreen rectangles from casual exploration', () => {
    for (const rect of [
      { left: 50, top: 50, right: 100, bottom: 80, width: 50, height: 30 },
      { left: -500, top: 50, right: -450, bottom: 80, width: 50, height: 30 },
      { left: 50, top: 50, right: 50, bottom: 50, width: 0, height: 0 },
    ]) {
      const control = document.createElement('button');
      control.getBoundingClientRect = () => rect as DOMRect;
      document.body.append(control);
    }
    expect(samplePetControlEdges()).toEqual([{ x: 112, y: 72 }]);
  });

  it('keeps its position in reduced-motion mode instead of wandering', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    await mount();
    const pet = shadows[0].querySelector('.floating-pet') as HTMLElement;
    const initial = pet.style.transform;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(pet.style.transform).toBe(initial);
  });

  it('removes listeners, subscriptions, timers, and its DOM root on cleanup', async () => {
    data.settings.following = true;
    const addedDocument = vi.spyOn(document, 'addEventListener');
    const removedDocument = vi.spyOn(document, 'removeEventListener');
    const addedWindow = vi.spyOn(window, 'addEventListener');
    const removedWindow = vi.spyOn(window, 'removeEventListener');
    await mount();
    const visibility = addedDocument.mock.calls.find(([type]) => type === 'visibilitychange');
    const pointer = addedDocument.mock.calls.find(([type]) => type === 'pointermove');
    const resize = addedWindow.mock.calls.find(([type]) => type === 'resize');
    expect(visibility).toBeTruthy();
    expect(pointer).toBeTruthy();
    expect(resize).toBeTruthy();
    await act(async () => {
      cleanupMounted?.();
    });
    cleanupMounted = undefined;
    expect(document.getElementById('mochi-companion-v1')).toBeNull();
    expect(removeSubscription).toHaveBeenCalledTimes(1);
    expect(removedDocument).toHaveBeenCalledWith('visibilitychange', visibility![1]);
    expect(removedDocument).toHaveBeenCalledWith('pointermove', pointer![1]);
    expect(removedWindow).toHaveBeenCalledWith('resize', resize![1]);
    expect(removeRuntimeListener).toHaveBeenCalledWith(addRuntimeListener.mock.calls[0][0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a new mount alive when an old cleanup is called again', async () => {
    await mount();
    const oldCleanup = cleanupMounted!;
    await act(async () => {
      oldCleanup();
    });
    cleanupMounted = undefined;
    const replacement = await mount();
    await act(async () => {
      oldCleanup();
    });
    expect(document.getElementById('mochi-companion-v1')).toBe(replacement);
    expect(document.querySelectorAll('#mochi-companion-v1')).toHaveLength(1);
    expect(removeSubscription).toHaveBeenCalledTimes(1);
  });

  it('retains its overlay and subscriptions while a page enters the back-forward cache', async () => {
    const host = await mount();
    const event = new Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: true });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(document.getElementById('mochi-companion-v1')).toBe(host);
    expect(removeSubscription).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('cleans up on pagehide and can mount again without duplicate roots', async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(document.getElementById('mochi-companion-v1')).toBeNull();
    expect(removeSubscription).toHaveBeenCalledTimes(1);
    cleanupMounted = undefined;
    await mount();
    expect(document.querySelectorAll('#mochi-companion-v1')).toHaveLength(1);
    expect(client.request).toHaveBeenCalledTimes(2);
  });
});
