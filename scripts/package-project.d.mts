export function validateProjectFiles(
  files: Record<string, Uint8Array>,
  options?: { quality?: boolean },
): { clips: number; frames: number; atlases: number };
export function packageProject(): Promise<{
  bytes: Uint8Array;
  files: Record<string, Uint8Array>;
  report: { clips: number; frames: number; atlases: number };
  output: string;
}>;

export function validateSpriteSourceReceipt(files: Record<string, Uint8Array>): {
  revision: string;
  files: number;
};
