import type { ReleaseFiles } from './release-utils.mjs';
export const DOWNLOAD_FILES: { windows: string; browser: string; source: string };
export const sha256: (bytes: Uint8Array) => string;
export interface DownloadManifest {
  version: string;
  assets: Partial<
    Record<'windows' | 'browser' | 'source', { file: string; sha256: string; bytes: number }>
  >;
}
export function createDownloadManifest(
  version: string,
  bundles: Map<string, Uint8Array>,
): DownloadManifest;
export function validateDownloadManifest(
  value: DownloadManifest,
  version: string,
  bundles: Map<string, Uint8Array>,
): void;
export function composeCompleteFiles(
  source: ReleaseFiles,
  windows: ReleaseFiles,
  browser: ReleaseFiles,
): ReleaseFiles;
export function validateCompleteFiles(
  files: ReleaseFiles,
  source: ReleaseFiles,
  windows: ReleaseFiles,
  browser: ReleaseFiles,
): void;
