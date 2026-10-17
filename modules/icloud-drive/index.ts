/**
 * iCloud Drive access for backups. Loaded optionally so a binary built
 * before this native module existed (or Expo Go) renders the JS just fine —
 * callers must handle `null` as "iCloud unsupported in this build".
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export type CloudFileInfo = {
  exists: boolean;
  downloaded: boolean;
  modifiedAt: number | null; // epoch ms
  size: number | null;
};

type ICloudDriveModule = {
  isAvailable(): boolean;
  /** same check off the JS thread — safe to call from tap handlers */
  isAvailableAsync(): Promise<boolean>;
  writeFile(name: string, base64: string): Promise<void>;
  fileInfo(name: string): Promise<CloudFileInfo>;
  readFile(name: string, timeoutMs: number): Promise<string>;
  /*
   * SYNC FILES (2.0.0) — a separate, hidden folder (`OpenTVSync/` beside
   * Documents, so not in the Files app), plain text, one path component per
   * name. OPTIONAL: a binary built before 2.0.0 has the module without these,
   * so callers check `typeof ICloud.listFiles === 'function'` before trusting
   * them (`cloudSyncSupported`).
   */
  /** Every file iCloud knows about there, delivered (`ready`) or not yet. */
  listFiles?(): Promise<{ name: string; ready: boolean; modifiedAt: number }[]>;
  writeText?(name: string, text: string): Promise<void>;
  /** Waits up to `timeoutMs` for an undelivered file, then throws. */
  readText?(name: string, timeoutMs: number): Promise<string>;
  deleteFile?(name: string): Promise<void>;
};

export default requireOptionalNativeModule<ICloudDriveModule>('ICloudDrive');
