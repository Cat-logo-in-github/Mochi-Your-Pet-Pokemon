// @vitest-environment jsdom
import { act, Profiler } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Pet } from '../apps/extension/src/ui/Pet';
import {
  petAtlasCache,
  releasePetAtlasCache,
  PetAtlasCache,
} from '../apps/extension/src/ui/petAssets';
import { fixtureClip, fixturePetManifest } from './fixtures/petManifest';
let testId = 0;
let media: MediaQueryList;
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  private path = '';
  get src() {
    return this.path;
  }
  set src(value: string) {
    this.path = value;
    if (value) void Promise.resolve().then(() => this.onload?.());
  }
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
    await settle();
  });
}
function base() {
  return `https://mochi.test/art-${testId++}/`;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => fixturePetManifest() })),
  );
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => media),
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  releasePetAtlasCache();
});
afterEach(() => {
  cleanup();
  releasePetAtlasCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded browser 2D sprite playback', () => {
  it('advances frames imperatively without React committing on every animation frame', async () => {
    const commits = vi.fn();
    const { container } = render(
      <Profiler id="pet" onRender={commits}>
        <Pet assetBase={base()} size={96} />
      </Profiler>,
    );
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.querySelector('svg')).toBeNull();
    expect(art.dataset.petStatus).toBe('playing');
    const count = commits.mock.calls.length;
    await advance(500);
    expect(Number(art.dataset.petFrame)).toBeGreaterThanOrEqual(5);
    expect(art.style.backgroundSize).toBe('768px 384px');
    expect(commits).toHaveBeenCalledTimes(count);
    expect(container.querySelector('.mochi-art')).toBe(art);
  });
  it('selects drawn left/right sprites with crisp pixel boundaries', async () => {
    const artwork = base();
    const { container, rerender } = render(
      <Pet assetBase={artwork} mood="walking" direction="left" />,
    );
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.petDirection).toBe('left');
    expect(art.style.backgroundImage).toContain('walk_eevee_left');
    rerender(<Pet assetBase={artwork} mood="walking" direction="right" />);
    await act(settle);
    expect(art.dataset.petDirection).toBe('right');
    expect(art.style.backgroundImage).toContain('walk_eevee_right');
    expect(art.style.transform).toBe('');
    expect(art.style.imageRendering).toBe('pixelated');
    expect((art.querySelector('.pet-transition-frame') as HTMLElement).style.opacity).toBe('0');
  });

  it('previews a source action using its exact frame holds without polling held pixels', async () => {
    const manifest = fixturePetManifest();
    manifest.clips.pmd_pose_eevee_front = {
      ...fixtureClip('pmd_pose', 3, 2, false),
      frameDurationsMs: [80, 420, 160],
    };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => manifest } as Response);
    const complete = vi.fn();
    const { container } = render(
      <Pet assetBase={base()} actionOverride="pmd_pose" onComplete={complete} />,
    );
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.petAction).toBe('pmd_pose');
    await advance(79);
    expect(art.dataset.petFrame).toBe('0');
    await advance(1);
    expect(art.dataset.petFrame).toBe('1');
    await advance(419);
    expect(art.dataset.petFrame).toBe('1');
    await advance(1);
    expect(art.dataset.petFrame).toBe('2');
    await advance(160);
    expect(complete).toHaveBeenCalledExactlyOnceWith('pmd_pose');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('starts a short source clip only once its first atlas is decoded', async () => {
    const images: { onload: (() => void) | null }[] = [];
    class DelayedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      decoding = '';
      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal('Image', DelayedImage);
    const manifest = fixturePetManifest();
    manifest.clips.pmd_short_eevee_front = {
      ...fixtureClip('pmd_short', 2, 2, false),
      frameDurationsMs: [100, 200],
    };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => manifest } as Response);
    const complete = vi.fn();
    const { container } = render(
      <Pet assetBase={base()} actionOverride="pmd_short" onComplete={complete} />,
    );
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(images).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await advance(5000);
    expect(complete).not.toHaveBeenCalled();
    await act(async () => {
      images[0].onload?.();
      await settle();
    });
    expect(art.dataset.petFrame).toBe('0');
    await advance(100);
    expect(art.dataset.petFrame).toBe('1');
    await advance(200);
    expect(complete).toHaveBeenCalledExactlyOnceWith('pmd_short');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('holds a legitimate single-frame source pose without continual redraw polling', async () => {
    const manifest = fixturePetManifest();
    manifest.clips.pmd_still_eevee_front = {
      ...fixtureClip('pmd_still', 1, 0.5, true),
      frameDurationsMs: [2000],
    };
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => manifest } as Response);
    const complete = vi.fn();
    const { container } = render(
      <Pet assetBase={base()} actionOverride="pmd_still" onComplete={complete} />,
    );
    await act(settle);
    await advance(2000);
    expect((container.querySelector('.mochi-art') as HTMLElement).dataset.petFrame).toBe('0');
    expect(complete).toHaveBeenCalledExactlyOnceWith('pmd_still');
    expect(vi.getTimerCount()).toBe(0);
    await advance(3600000);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('suspends a website pet when it scrolls outside the visible viewport', async () => {
    let report!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: IntersectionObserverCallback) {
        report = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const { container } = render(<Pet assetBase={base()} />);
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    await act(async () => {
      report(
        [{ target: art, isIntersecting: false } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await settle();
    });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      report(
        [{ target: art, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await settle();
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not restart a front-only carry clip when the user changes drag direction', async () => {
    const artwork = base();
    const { container, rerender } = render(
      <Pet assetBase={artwork} mood="dragged" direction="left" />,
    );
    await act(settle);
    await advance(500);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    const before = Number(art.dataset.petFrame);
    rerender(<Pet assetBase={artwork} mood="dragged" direction="right" />);
    await act(settle);
    await advance(120);
    expect(art.dataset.petAction).toBe('carry');
    expect(art.dataset.petDirection).toBe('front');
    expect(Number(art.dataset.petFrame)).toBeGreaterThan(before);
  });

  it('can start after initially mounting in a hidden document', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const { container } = render(<Pet assetBase={base()} />);
    await act(settle);
    expect(vi.getTimerCount()).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
    });
    expect((container.querySelector('.mochi-art') as HTMLElement).dataset.petStatus).toBe(
      'playing',
    );
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops a non-looping clip on its final metadata frame without leaving a timer running', async () => {
    const done = vi.fn();
    const { container } = render(<Pet assetBase={base()} mood="grooming" onComplete={done} />);
    await act(settle);
    await advance(12050);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.petFrame).toBe('287');
    expect(art.dataset.petStatus).toBe('complete');
    expect(done).toHaveBeenCalledExactlyOnceWith('groom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps long metadata-driven actions intact when an older parent requests idle early', async () => {
    const artwork = base(),
      complete = vi.fn();
    const { container, rerender } = render(
      <Pet assetBase={artwork} mood="grooming" onComplete={complete} />,
    );
    await act(settle);
    await advance(1000);
    rerender(<Pet assetBase={artwork} mood="idle" onComplete={complete} />);
    await advance(9000);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.petAction).toBe('groom');
    expect(Number(art.dataset.petFrame)).toBeGreaterThanOrEqual(230);
    expect(complete).not.toHaveBeenCalled();
    await advance(2100);
    expect(complete).toHaveBeenCalledWith('groom');
    expect(art.dataset.petAction).toBe('idle');
  });
  it('holds at most three decoded atlas references across an extended multi-atlas clip', async () => {
    render(<Pet assetBase={base()} mood="grooming" />);
    await act(settle);
    for (let i = 0; i < 10; i++) {
      await advance(1000);
      expect(petAtlasCache.size).toBeLessThanOrEqual(3);
    }
    expect(petAtlasCache.size).toBeGreaterThan(0);
  });
  it('stops all frame timers and releases atlas references while its document is hidden', async () => {
    const { container } = render(<Pet assetBase={base()} />);
    await act(settle);
    await advance(500);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    const before = Number(art.dataset.petFrame);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(petAtlasCache.size).toBe(0);
    expect(art.style.backgroundImage).toContain('posters/eevee.png');
    await advance(3600000);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
    });
    expect(Number(art.dataset.petFrame)).toBeLessThanOrEqual(before + 1);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('uses static posters for paused, reduced-motion and gallery previews', async () => {
    const { container, rerender } = render(
      <Pet assetBase={base()} skin="leafeon" animated={false} />,
    );
    await act(settle);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect((container.querySelector('.mochi-art') as HTMLElement).style.backgroundImage).toContain(
      'posters/leafeon.png',
    );
    rerender(<Pet assetBase={base()} paused />);
    await act(settle);
    expect(vi.getTimerCount()).toBe(0);
    Object.defineProperty(media, 'matches', { value: true, writable: true });
    rerender(<Pet assetBase={base()} />);
    await act(settle);
    expect(vi.getTimerCount()).toBe(0);
    expect(petAtlasCache.size).toBe(0);
  });
  it('releases its cache and pending frame timer when the final player unmounts', async () => {
    const { unmount } = render(<Pet assetBase={base()} />);
    await act(settle);
    expect(petAtlasCache.size).toBeGreaterThan(0);
    unmount();
    expect(petAtlasCache.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not let an obsolete image failure evict a replacement requested after a visibility change', async () => {
    const images: { onload: (() => void) | null; onerror: (() => void) | null; src: string }[] = [];
    class PendingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      decoding = '';
      constructor() {
        images.push(this);
      }
    }
    vi.stubGlobal('Image', PendingImage);
    const cache = new PetAtlasCache(3),
      url = 'https://mochi.test/one.png';
    const old = cache.load(url).catch(() => undefined);
    cache.clear();
    const replacement = cache.load(url);
    images[0].onerror?.();
    await old;
    expect(cache.size).toBe(1);
    expect(cache.load(url)).toBe(replacement);
    images[1].onload?.();
    await replacement;
  });

  it('keeps a poster and stops when packaged assets cannot be read', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const { container } = render(<Pet assetBase={base()} />);
    await act(settle);
    const art = container.querySelector('.mochi-art') as HTMLElement;
    expect(art.dataset.petStatus).toBe('unavailable');
    expect(art.style.backgroundImage).toContain('posters/eevee.png');
    expect(vi.getTimerCount()).toBe(0);
    await advance(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
