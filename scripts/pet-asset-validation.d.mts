export type PetAssetFiles = Record<string, Uint8Array>;
export function pngDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
};
export function decodeRgbaPng(
  bytes: Uint8Array,
): ReturnType<typeof pngDimensions> & { pixels: Uint8Array };
export function parsePetManifest(bytes: Uint8Array): Record<string, unknown>;
export function validatePetAssets(
  files: PetAssetFiles,
  options?: { quality?: boolean; complete?: boolean },
): {
  render: string;
  clips: number;
  atlases: number;
  frames: number;
  longestSeconds: number;
  shortestSeconds: number;
  alphaFrames: number;
  byClip: Record<string, { frames: number; seconds: number; uniqueFrames: number }>;
};
