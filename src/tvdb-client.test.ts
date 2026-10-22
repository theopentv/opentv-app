/** A TheTVDB token kept across launches is reused only while young, and only
 *  under the key that earned it; identical requests in flight share one. */
jest.mock('@/db', () => ({ getMeta: () => null, setMeta: () => {} }));
jest.mock('@/i18n', () => ({ plotTvdbCodes: () => ['eng'] }));
jest.mock('@/tvdb-key', () => ({ THETVDB_API_KEY: 'bundled-key-0000' }));
jest.mock('@/net-circuit', () => ({ netGuard: () => {}, netReachable: () => {}, netUnreachable: () => {}, isNetworkError: () => false }));
jest.mock('@/pure', () => ({}));

import { tvdbSeries, usableStoredToken } from './tvdb';

const DAY = 86400000;
const stored = (k: string, at: number) => JSON.stringify({ t: 'tok', at, k });
const KEY = 'bundled-key-0000';
const tag = `${KEY.length}:0000`;

it('reuses a young token issued to this key', () => {
  expect(usableStoredToken(stored(tag, 0), KEY, 10 * DAY)).toBe('tok');
});

it('refuses an old one, another key’s, a future stamp, or junk', () => {
  expect(usableStoredToken(stored(tag, 0), KEY, 26 * DAY)).toBeNull();
  expect(usableStoredToken(stored(tag, 0), 'user-key-9999', DAY)).toBeNull();
  expect(usableStoredToken(stored(tag, 5 * DAY), KEY, DAY)).toBeNull();
  expect(usableStoredToken('', KEY, 0)).toBeNull();
  expect(usableStoredToken('{nope', KEY, 0)).toBeNull();
  expect(usableStoredToken(JSON.stringify({ at: 0, k: tag }), KEY, 0)).toBeNull();
});

it('sends one request for two identical lookups in the air together', async () => {
  const calls: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    calls.push(url);
    const body = url.endsWith('/login') ? { data: { token: 'tok' } } : { data: { id: 7, name: 'Seven' } };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  const [a, b] = await Promise.all([tvdbSeries(7), tvdbSeries(7)]);
  expect(a?.name).toBe('Seven');
  expect(b).toBe(a);
  expect(calls.filter((u) => u.endsWith('/series/7'))).toHaveLength(1);
  // settled = forgotten: the next ask is a new request
  await tvdbSeries(7);
  expect(calls.filter((u) => u.endsWith('/series/7'))).toHaveLength(2);
});
