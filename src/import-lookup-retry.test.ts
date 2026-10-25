/** A network drop in the middle of an import's lookups must not mark every
 *  remaining show "not found": the pass waits for TMDB and tries them again. */
jest.mock('@/db', () => ({ getMeta: () => null, setMeta: () => {} }));
jest.mock('@/tmdb-token', () => ({ TMDB_TOKEN: 'test' }));

import { netReset } from './net-circuit';
import { lookupWithRetry, tmdb } from './tmdb';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  netReset();
});

/** A fake TMDB: network errors while `down`, real answers otherwise. */
function fakeTmdb() {
  const state = { down: false };
  global.fetch = (async (url: string) => {
    if (state.down) throw new TypeError('Network request failed');
    if (String(url).includes('/configuration')) return { ok: true, status: 200, json: async () => ({}) };
    const id = Number(/find\/(\d+)/.exec(String(url))?.[1]);
    return { ok: true, status: 200, json: async () => ({ tv_results: [{ id: id + 1000 }] }) };
  }) as unknown as typeof fetch;
  return state;
}

it('retries what a mid-pass network drop left unresolved', async () => {
  const net = fakeTmdb();
  const ids = Array.from({ length: 60 }, (_, i) => i + 1);
  const found = new Map<number, number>();
  let calls = 0;
  await lookupWithRetry(
    ids,
    async (id) => {
      calls += 1;
      // the connection drops after the first 15 lookups and comes back while
      // the import waits
      if (calls === 15) {
        net.down = true;
        setTimeout(() => (net.down = false), 50);
      }
      try {
        const r = await tmdb<{ tv_results: { id: number }[] }>(`/find/${id}?external_source=tvdb_id`);
        found.set(id, r.tv_results[0].id);
      } catch {
        // a failed lookup leaves the show unresolved, as the importer does
      }
    },
    (id) => !found.has(id),
    10,
  );
  expect(found.size).toBe(60);
}, 30000);

it('does not retry when the network held (a miss is a real miss)', async () => {
  fakeTmdb();
  let calls = 0;
  await lookupWithRetry(
    [1, 2, 3],
    async () => {
      calls += 1;
    },
    () => true, // nothing ever resolves, but nothing failed on the network
    2,
  );
  expect(calls).toBe(3);
});
