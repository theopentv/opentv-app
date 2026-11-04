/**
 * Un-marking takes the episode's reactions with it, and Undo puts back exactly
 * what was there (4 Nov). Real SQLite behind the same shim `mark-many.test.ts`
 * uses, so the schema, the tombstones and the outbox run as on a phone.
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
import db, {
  markRewatched,
  markWatched,
  pendingOps,
  restoreUnmarked,
  setApplyingRemote,
  setCharacterVote,
  setEpisodeRating,
  setMeta,
  snapshotEpisodes,
  snapshotHasReactions,
  toggleEpisodeEmotion,
  unmarkedEpisodeKeys,
  unmarkWatched,
  unmarkWatchedMany,
} from '@/db';

function reset(): void {
  db.execSync(
    'DELETE FROM watches; DELETE FROM shows; DELETE FROM sync_outbox; DELETE FROM episode_ratings; DELETE FROM episode_emotions; DELETE FROM character_votes; DELETE FROM comments;',
  );
  setMeta('unmarkedEpisodes', '[]');
  setMeta('sync.on', '1');
  setMeta('sync.seq', '0');
}

/** Watched twice (a rewatch on its own day), rated 7, two feelings, a favourite, a comment. */
function seed(): void {
  markWatched(1, 2, 3, '2024-01-05 20:00:00');
  db.runSync("INSERT INTO watches (showId, season, episode, watchedAt, rewatch, runtime) VALUES (1, 2, 3, '2025-06-01 21:00:00', 1, 42)");
  setEpisodeRating(1, 2, 3, 7);
  toggleEpisodeEmotion(1, 2, 3, 1);
  toggleEpisodeEmotion(1, 2, 3, 4);
  setCharacterVote(1, 2, 3, 'Walter');
  db.runSync("INSERT INTO comments (type, entity, text, date) VALUES ('episode', '1-2-3', 'Great one', '2024-01-05')");
  db.execSync('DELETE FROM sync_outbox');
}

function state() {
  return {
    watches: db.getAllSync('SELECT watchedAt, rewatch, runtime FROM watches WHERE showId = 1 ORDER BY watchedAt'),
    stars: db.getAllSync('SELECT stars FROM episode_ratings'),
    emotions: db.getAllSync('SELECT emotion FROM episode_emotions ORDER BY emotion'),
    character: db.getAllSync('SELECT name FROM character_votes'),
    comments: db.getAllSync('SELECT text FROM comments'),
    seen: db.getFirstSync<{ episodesSeen: number }>('SELECT episodesSeen FROM shows WHERE tvdbId = 1')?.episodesSeen,
    tombstones: [...unmarkedEpisodeKeys()],
  };
}

// In the order they were queued: the outbox id is "device:n", which sorts as text.
const seq = (id: string) => Number(id.split(':').pop());
const kinds = () =>
  pendingOps()
    .sort((a, b) => seq(a.id) - seq(b.id))
    .map((o) => [o.kind, JSON.parse(o.payload)]);

describe('un-marking an episode', () => {
  it('removes the rating, feelings and favourite, keeps the comment, and says so to the other devices', () => {
    reset();
    seed();
    const snap = unmarkWatched(1, 2, 3);
    expect(snapshotHasReactions(snap)).toBe(true);
    expect(state()).toEqual({
      watches: [],
      stars: [],
      emotions: [],
      character: [],
      comments: [{ text: 'Great one' }],
      seen: 0,
      tombstones: ['1-2-3'],
    });
    expect(kinds().map((k) => k[0])).toEqual(['unwatch', 'unrate', 'emotion', 'emotion', 'charVote']);
    expect(kinds().filter((k) => k[0] === 'emotion').every((k) => k[1].on === false)).toBe(true);
    expect(kinds().find((k) => k[0] === 'charVote')?.[1].name).toBeNull();
  });

  it('Undo restores exactly what was there, rewatch dates included', () => {
    reset();
    seed();
    const before = state();
    const snap = unmarkWatched(1, 2, 3);
    db.execSync('DELETE FROM sync_outbox');
    restoreUnmarked(snap);
    expect(state()).toEqual(before);
    expect(kinds().map((k) => k[0])).toEqual(['watch', 'rewatch', 'rate', 'emotion', 'emotion', 'charVote']);
    expect(kinds()[0][1].at).toBe('2024-01-05 20:00:00');
    expect(kinds().find((k) => k[0] === 'rate')?.[1].ten).toBe(7);
  });

  it('a batch clears every episode and restores every episode', () => {
    reset();
    seed();
    markWatched(1, 2, 4, '2024-01-06 20:00:00');
    const before = state();
    const snap = unmarkWatchedMany(1, [
      { season: 2, episode: 3 },
      { season: 2, episode: 4 },
    ]);
    expect(state().watches).toEqual([]);
    restoreUnmarked(snap);
    expect(state()).toEqual(before);
  });

  it('with nothing to lose, the snapshot says so', () => {
    reset();
    markWatched(1, 1, 1, '2024-01-01 20:00:00');
    expect(snapshotHasReactions(snapshotEpisodes(1, [{ season: 1, episode: 1 }]))).toBe(false);
  });

  it('keepReactions (the cancelled "mark earlier ones" prompt) takes only the tick', () => {
    reset();
    seed();
    unmarkWatched(1, 2, 3, { keepReactions: true });
    const s = state();
    expect(s.watches).toEqual([]);
    expect(s.stars).toEqual([{ stars: 7 }]);
    expect(s.emotions).toHaveLength(2);
    expect(s.character).toEqual([{ name: 'Walter' }]);
    expect(kinds().map((k) => k[0])).toEqual(['unwatch']);
  });

  it("another device's un-mark clears locally and echoes nothing back", () => {
    reset();
    seed();
    setApplyingRemote(true);
    try {
      unmarkWatched(1, 2, 3);
    } finally {
      setApplyingRemote(false);
    }
    expect(state().stars).toEqual([]);
    expect(pendingOps()).toEqual([]);
  });

  it('a rewatch alone restores as a rewatch', () => {
    reset();
    markWatched(1, 1, 1, '2024-01-01 20:00:00');
    markRewatched(1, 1, 1);
    const before = state();
    restoreUnmarked(unmarkWatched(1, 1, 1));
    expect(state()).toEqual(before);
  });
});
