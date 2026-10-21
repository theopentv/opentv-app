/** "Keep your library safe" must not follow "OpenTV Backup is on" (21 Oct). */
const meta: Record<string, string> = {};
let dest: string | null = null;
let icloudOn = false;
const alerts: string[] = [];

jest.mock('react-native', () => ({
  Alert: { alert: (title: string) => void alerts.push(title) },
  Linking: {},
  Platform: { OS: 'ios' },
}));
jest.mock('@/i18n', () => ({ t: (k: string) => k }));
jest.mock('@/backup', () => ({ icloudSupported: () => true, icloudAvailableAsync: async () => icloudOn }));
jest.mock('@/cloud-backup', () => ({ backupDestination: () => dest }));
jest.mock('@/db', () => ({
  __esModule: true,
  default: { getFirstSync: () => ({ n: 12 }) },
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
  hasLibrary: () => true,
}));

import { offerBackupIfDue } from '@/backup-prompt';

beforeEach(() => {
  for (const k of Object.keys(meta)) delete meta[k];
  alerts.length = 0;
  dest = null;
});

it('asks when the library is only on this phone', async () => {
  expect(await offerBackupIfDue()).toBe(true);
  expect(alerts).toEqual(['backupPrompt.title']);
});

it('stays quiet once OpenTV Backup holds a copy, and never asks again', async () => {
  dest = 'opentv';
  expect(await offerBackupIfDue()).toBe(false);
  expect(alerts).toEqual([]);
  expect(meta.backupPromptAsked).toBe('1');
});
