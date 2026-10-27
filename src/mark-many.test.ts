/**
 * `markWatchedMany` / `unmarkWatchedMany` against real SQLite (Node's built-in),
 * behind a thin `expo-sqlite` shim, so the whole of `db.ts` — schema, meta,
 * tombstones, the outbox — runs as it does on a phone.
 *
 * THE PROMISE UNDER TEST: the batch writes exactly what the per-episode loop
 * wrote. Same watch rows, same counter, same tombstones, and the same sync ops
 * in the same order, so another device cannot tell which path made them.
 */
jest.mock('expo-sqlite', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync: Db } = require('node:sqlite') as typeof import('node:sqlite');
  type P = (string | number | null)[];
  return {
    openDatabaseSync: () => {
      const d = new Db(':memory:');
      const args = (p?: P | Record<string, unknown>) => (Array.isArray(p) ? p : p == null ? [] : [p]) as P;
      return {
        execSync: (sql: string) => d.exec(sql),
        runSync: (sql: string, p?: P) => {
          const r = d.prepare(sql).run(...args(p));
          return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
        },
        getFirstSync: (sql: string, p?: P) => d.prepare(sql).get(...args(p)) ?? null,
        getAllSync: (sql: string, p?: P) => d.prepare(sql).all(...args(p)),
        withTransactionSync: (fn: () => void) => {
          d.exec('BEGIN');
          try {
            fn();
            d.exec('COMMIT');
          } catch (e) {
            d.exec('ROLLBACK');
            throw e;
          }
        },
      };
    },
  };
});

// eslint-disable-next-line import/first
import db, { markWatched, markWatchedMany, pendingOps, setMeta, unmarkedEpisodeKeys, unmarkWatched, unmarkWatchedMany } from '@/db';

const AT = '2026-10-27 12:00:00';

function reset(): void {
  db.execSync('DELETE FROM watches; DELETE FROM shows; DELETE FROM sync_outbox;');
  setMeta('unmarkedEpisodes', '[]');
  setMeta('sync.on', '1');
  setMeta('sync.seq', '0');
}

function snapshot() {
  return {
    watches: db.getAllSync('SELECT showId, season, episode, watchedAt, rewatch FROM watches ORDER BY season, episode'),
    seen: db.getFirstSync<{ episodesSeen: number }>('SELECT episodesSeen FROM shows WHERE tvdbId = 1')?.episodesSeen,
    tombstones: [...unmarkedEpisodeKeys()].sort(),
    ops: pendingOps().map((o) => [o.id, o.kind, o.payload]),
  };
}

const eps = [
  { season: 1, episode: 1 },
  { season: 1, episode: 2 },
  { season: 2, episode: 1 },
];

describe('markWatchedMany', () => {
  it('writes what one markWatched per episode wrote', () => {
    reset();
    unmarkWatched(1, 1, 2); // a standing tombstone the batch must clear
    unmarkWatched(1, 3, 3); // and one it must leave alone
    for (const e of eps) markWatched(1, e.season, e.episode, AT);
    const loop = snapshot();

    reset();
    unmarkWatched(1, 1, 2);
    unmarkWatched(1, 3, 3);
    markWatchedMany(1, eps, AT);
    expect(snapshot()).toEqual(loop);
    expect(loop.seen).toBe(3);
    expect(loop.tombstones).toEqual(['1-3-3']);
    expect(loop.ops.filter((o) => o[1] === 'watch')).toHaveLength(3);
  });

  it('puts the show in the library, like markWatched', () => {
    reset();
    markWatchedMany(1, eps, AT);
    expect(db.getFirstSync<{ followed: number }>('SELECT followed FROM shows WHERE tvdbId = 1')?.followed).toBe(1);
  });

  it('does nothing at all for an empty list', () => {
    reset();
    markWatchedMany(1, [], AT);
    expect(snapshot()).toEqual({ watches: [], seen: undefined, tombstones: [], ops: [] });
  });
});

describe('unmarkWatchedMany', () => {
  it('writes what one unmarkWatched per episode wrote', () => {
    reset();
    markWatchedMany(1, eps, AT);
    for (const e of eps.slice(0, 2)) unmarkWatched(1, e.season, e.episode);
    const loop = snapshot();

    reset();
    markWatchedMany(1, eps, AT);
    unmarkWatchedMany(1, eps.slice(0, 2));
    expect(snapshot()).toEqual(loop);
    expect(loop.seen).toBe(1);
    expect(loop.tombstones).toHaveLength(2);
  });
});
