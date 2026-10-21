/** Own-cloud sync must refuse to start while OpenTV (server) sync is on. */
const meta: Record<string, string> = {};
let serverOn = true;
const touched: string[] = [];

jest.mock('expo-device', () => ({}));
jest.mock('react-native', () => ({ InteractionManager: {}, Platform: { OS: 'ios' } }));
jest.mock('../modules/icloud-drive', () => ({ __esModule: true, default: null }));
jest.mock('@/db', () => ({
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
  dropOps: () => {},
  notifyRemoteChange: () => {},
  pendingOps: () => [],
  setApplyingRemote: () => {},
}));
jest.mock('@/device-id', () => ({ deviceId: () => 'dev' }));
jest.mock('@/devices', () => ({ pickDeviceName: () => 'x' }));
jest.mock('@/sync-apply', () => ({ applyRemoteOps: () => {} }));
jest.mock('@/device-sync', () => ({ syncEnabled: () => serverOn }));
jest.mock('@/backup', () => ({
  icloudAvailableAsync: async () => {
    touched.push('icloud');
    return true;
  },
}));
jest.mock('@/gdrive-backup', () => ({
  connectDrive: async () => {
    touched.push('drive');
    return 'ok';
  },
}));

import { turnOnCloudSync } from '@/cloud-sync';

it('refuses both clouds while server sync is on, touching nothing', async () => {
  expect(await turnOnCloudSync('icloud')).toBe('server-on');
  expect(await turnOnCloudSync('gdrive')).toBe('server-on');
  expect(touched).toEqual([]);
  expect(meta['cloudSync.via']).toBeUndefined();
});
