/**
 * A second device of the same account learns its togethers without Lists
 * being opened (21 Oct): the index used to be fetched only by the Lists
 * screens or once `communityTogetherActive` was already set.
 */
const meta: Record<string, string> = {};
let fetches = 0;
let rows: unknown[] = [];

jest.mock('expo-router', () => ({ router: {}, useFocusEffect: () => {} }));
jest.mock('@/analytics', () => ({ track: () => {} }));
jest.mock('@/api', () => ({ ApiError: class extends Error {}, api: async () => ({}) }));
jest.mock('@/plus', () => ({ PLUS_AVAILABLE: true, requirePlus: () => true }));
jest.mock('@/community-session', () => ({ getProfileId: () => 'p1', getToken: async () => null, isJoined: () => true }));
jest.mock('@/community-shared-lists', () => ({
  fetchSharedList: async () => null,
  fetchSharedLists: async () => {
    fetches++;
    return rows;
  },
}));
jest.mock('@/db', () => ({
  furthestWatched: () => null,
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
  getShowBrief: () => ({}),
  showWatchCount: () => 0,
  onLocalChange: () => () => {},
  onRemoteChange: () => () => {},
}));

import { cachedTogethersFor, syncTogetherIfNeeded } from '@/community-together';

// `noteTogetherIndex` schedules the debounced publish; never let it outlive the test.
jest.useFakeTimers();

beforeEach(() => {
  for (const k of Object.keys(meta)) delete meta[k];
  fetches = 0;
  rows = [];
});

it('fetches the index for a member never seen in a together, and finds theirs', async () => {
  rows = [{ id: 'L1', kind: 'together', show: { target_key: '81189' } }];
  await syncTogetherIfNeeded();
  expect(fetches).toBe(1);
  expect(meta.communityTogetherActive).toBe('1');
  expect(JSON.parse(meta.communityTogetherShows)).toEqual([{ listId: 'L1', tvdbId: 81189 }]);
  expect(cachedTogethersFor(81189)).toEqual([]); // details arrive with the show page's own fetch
});

it('asks once a day, not on every foreground, when there is no together', async () => {
  await syncTogetherIfNeeded();
  await syncTogetherIfNeeded();
  expect(fetches).toBe(1);
  expect(meta.communityTogetherActive).toBeUndefined();
});
