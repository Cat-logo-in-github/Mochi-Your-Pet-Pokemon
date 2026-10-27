import { validatePetManifest, type PetManifest } from '@mochi/shared';

export function petAssetBase(input?: string): string {
  const inferred =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('mochi/')
      : `${import.meta.env.BASE_URL || '/'}mochi/`;
  const base = input || inferred;
  return base.endsWith('/') ? base : `${base}/`;
}
const manifests = new Map<string, Promise<PetManifest>>();
export function loadPetManifest(base: string): Promise<PetManifest> {
  const existing = manifests.get(base);
  if (existing) return existing;
  const pending = fetch(`${base}manifest.json`, { credentials: 'omit', cache: 'no-cache' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Mochi artwork is unavailable.');
      return validatePetManifest(await response.json());
    })
    .catch((error: unknown) => {
      if (manifests.get(base) === pending) manifests.delete(base);
      throw error;
    });
  if (manifests.size >= 4) manifests.delete(manifests.keys().next().value!);
  manifests.set(base, pending);
  return pending;
}
interface AtlasEntry {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
  settled: boolean;
}
/** At most three 2048x1024 RGBA atlases retained by this document: about 24 MiB. */
export class PetAtlasCache {
  private entries = new Map<string, AtlasEntry>();
  constructor(readonly maximum = 3) {}
  get size(): number {
    return this.entries.size;
  }
  load(url: string): Promise<HTMLImageElement> {
    const existing = this.entries.get(url);
    if (existing) {
      this.entries.delete(url);
      this.entries.set(url, existing);
      return existing.ready;
    }
    const image = new Image();
    image.decoding = 'async';
    const ready = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => {
        entry.settled = true;
        resolve(image);
        if (this.entries.get(url) !== entry) {
          image.onload = null;
          image.onerror = null;
          image.src = '';
        }
      };
      image.onerror = () => {
        entry.settled = true;
        if (this.entries.get(url) === entry) this.entries.delete(url);
        reject(new Error('A Mochi animation atlas could not be loaded.'));
      };
    });
    const entry: AtlasEntry = { image, ready, settled: false };
    this.entries.set(url, entry);
    image.src = url;
    while (this.entries.size > this.maximum) {
      const oldest = this.entries.keys().next().value!;
      const evicted = this.entries.get(oldest)!;
      this.entries.delete(oldest);
      if (evicted.settled) {
        evicted.image.onload = null;
        evicted.image.onerror = null;
        evicted.image.src = '';
      }
      // Pending requests own no decoded frame yet; their promise owners release them after settlement.
    }
    return ready;
  }
  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.settled) {
        entry.image.onload = null;
        entry.image.onerror = null;
        entry.image.src = '';
      }
    }
    this.entries.clear();
  }
}
export const petAtlasCache = new PetAtlasCache(3);
export function releasePetAtlasCache(): void {
  petAtlasCache.clear();
}

let activePlayers = 0;
export function retainPetAtlasPlayer(): () => void {
  activePlayers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activePlayers--;
    if (activePlayers === 0) petAtlasCache.clear();
  };
}
