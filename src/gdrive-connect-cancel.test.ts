/** Backing out of Google's account picker is a cancel, not a failure. */
const meta: Record<string, string> = {};
let signInType = 'cancelled';
const calls: string[] = [];

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/db', () => ({
  __esModule: true,
  default: {},
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
  hasLibrary: () => false,
}));
jest.mock('@/community-auth', () => ({ configureGoogle: () => {} }));
jest.mock('@/community-publish', () => ({ libraryRestored: () => {} }));
jest.mock('@/import-lock', () => ({ withImportLock: (f: () => unknown) => f() }));
jest.mock(
  '@react-native-google-signin/google-signin',
  () => ({
    GoogleSignin: {
      hasPlayServices: async () => true,
      signInSilently: async () => ({ type: 'noSavedCredentialFound', data: null }),
      signIn: async () => {
        calls.push('signIn');
        return { type: signInType, data: null };
      },
      addScopes: async () => {
        calls.push('addScopes');
        return null;
      },
      getCurrentUser: () => null,
      getTokens: async () => {
        throw new Error('no user');
      },
    },
  }),
  { virtual: true },
);

import { connectDrive } from '@/gdrive-backup';

it('returns cancelled when the account picker is dismissed, and asks for nothing more', async () => {
  expect(await connectDrive()).toBe('cancelled');
  expect(await connectDrive(true)).toBe('cancelled');
  expect(calls).toEqual(['signIn', 'signIn']);
  expect(meta.driveBackupOn).toBeUndefined();
});
