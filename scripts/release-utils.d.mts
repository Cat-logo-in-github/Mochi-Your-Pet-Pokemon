export type ReleaseFiles = Record<string, Uint8Array>;
export const repositoryRoot: string;
export const REQUIRED_SOURCE_FILES: readonly string[];
export function readTree(
  directory: string,
  shouldInclude?: (name: string, directory: boolean) => boolean,
  prefix?: string,
): Promise<ReleaseFiles>;
export function sourceIncludes(name: string, directory: boolean): boolean;
export function assertSafeEntries(entries: ReleaseFiles): void;
export function validateManifestFiles(files: ReleaseFiles): Record<string, unknown>;
export function validateSourceFiles(files: ReleaseFiles): void;
export function deterministicArchive(files: ReleaseFiles): Uint8Array;
export function assertFile(directory: string, filename: string): Promise<string>;
export function validateWebsiteFiles(files: ReleaseFiles): void;
export function validateWindowsFiles(files: ReleaseFiles): void;

export function assertPublicGoogleConfiguration(files: ReleaseFiles): void;
