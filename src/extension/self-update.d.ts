// self-update.js(キットの写し・無改変)の型。写しを型検査から外し、ここで形だけ示す。
export const SELF_UPDATE_ALARM: string;
export const SELF_UPDATE_PERIOD_MINUTES: number;
export function compareVersions(a: string, b: string): number;
export function extensionPageInFront(): Promise<boolean>;
export function checkForNewVersion(deps?: {
  fetchManifest?: () => Promise<{ version?: string }>;
  inFront?: () => Promise<boolean>;
  reload?: () => void;
}): Promise<{ action: 'store' | 'same' | 'busy' | 'reload' | 'error'; running: string; onDisk?: string; error?: string }>;
export function scheduleSelfUpdateCheck(): void;
