/**
 * "MARK IT FOR BOTH OF US", END TO END ON ONE PHONE: the real `catchUp` (via
 * `noteTogetherDetail`), the real `db.ts` on real SQLite, and server details in
 * exactly the shape the 2.4.0 Worker returned on a local run (11 Nov). What a
 * partner's phone would make this one do, checked in the watches table itself.
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

jest.mock('@/api', () => ({ api: jest.fn(async () => ({})), ApiError: class extends Error {} }));
jest.mock('@/community-session', () => ({ getProfileId: () => 'p_me', getToken: async () => 't', isJoined: () => true }));
jest.mock('@/analytics', () => ({ track: jest.fn() }));
jest.mock('@/plus', () => ({ isPlus: () => false, PLUS_AVAILABLE: true }));

// eslint-disable-next-line import/first
import { noteTogetherDetail } from '@/community-together';
// eslint-disable-next-line import/first
import db, { addShow, markWatched, setMeta, unmarkWatched } from '@/db';
// eslint-disable-next-line import/first
import type { SharedListDetail } from '@/community-shared-lists';

const SHOW = 273181;
jest.useFakeTimers();

function watched(): string[] {
  return db
    .getAllSync<{ season: number; episode: number }>('SELECT season, episode FROM watches WHERE showId = ? ORDER BY season, episode', [SHOW])
    .map((r) => `S${r.season}E${r.episode}`);
}
function dateOf(season: number, episode: number): string | undefined {
  return db.getFirstSync<{ watchedAt: string }>('SELECT watchedAt FROM watches WHERE showId = ? AND season = ? AND episode = ?', [SHOW, season, episode])?.watchedAt;
}
/** The detail as the Worker answers it, with the partner at (s, e). */
function detail(s: number, e: number, all: boolean, at = '2026-11-11T17:26:53.798Z'): SharedListDetail {
  return {
    id: 'sl_1', name: 'Better Call Saul', kind: 'together', is_owner: true, is_member: true, invite_code: 'ABC', created_at: '2026-11-11T17:26:00.000Z',
    members: [{ id: 'p_me', handle: 'me', is_me: true }, { id: 'p_partner', handle: 'partner', is_me: false }],
    items: [{ id: 'it_1', target_source: 'tvdb', target_key: String(SHOW), title: 'Better Call Saul', positions: [{ member_id: 'p_partner', season: s, episode: e, updated_at: at }] }],
    mark_together: { me: true, all },
  } as unknown as SharedListDetail;
}

beforeAll(() => {
  // Season lengths from the cached metadata, as the phone has them: 10 then 10.
  setMeta(`showMeta:${SHOW}`, JSON.stringify({ name: 'Better Call Saul', seasons: { 1: { count: 10 }, 2: { count: 10 } }, episodes: {}, structureSource: 'tvdb', fetchedAt: Date.now() }));
  addShow(SHOW, 'Better Call Saul', null);
  markWatched(SHOW, 1, 1, '2026-11-01 20:00:00');
  markWatched(SHOW, 1, 2, '2026-11-01 21:00:00');
});

describe('mark it for both of us, on the phone that is behind', () => {
  it('does nothing while only one of us has it on', () => {
    noteTogetherDetail(detail(1, 5, false));
    expect(watched()).toEqual(['S1E1', 'S1E2']);
  });

  it('marks up to the partner, dated by the partner, once both have it on', () => {
    noteTogetherDetail(detail(1, 5, true));
    expect(watched()).toEqual(['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5']);
    expect(dateOf(1, 5)).toBe('2026-11-11 17:26:53');
    expect(dateOf(1, 1)).toBe('2026-11-01 20:00:00'); // my own marks untouched
  });

  it('does not put back an episode I un-ticked, until the partner moves', () => {
    unmarkWatched(SHOW, 1, 5);
    noteTogetherDetail(detail(1, 5, true));
    expect(watched()).toEqual(['S1E1', 'S1E2', 'S1E3', 'S1E4']);
  });

  it('follows the partner across a season boundary when they move on', () => {
    noteTogetherDetail(detail(2, 2, true, '2026-11-12T20:00:00.000Z'));
    expect(watched()).toEqual(['S1E1', 'S1E2', 'S1E3', 'S1E4', 'S1E5', 'S1E6', 'S1E7', 'S1E8', 'S1E9', 'S1E10', 'S2E1', 'S2E2']);
  });

  it('never marks backwards when the partner is behind me', () => {
    noteTogetherDetail(detail(1, 3, true, '2026-11-13T20:00:00.000Z'));
    expect(watched()).toHaveLength(12);
  });

  it('never writes an episode my show does not have (absolute numbering on their side)', () => {
    noteTogetherDetail(detail(2, 250, true, '2026-11-14T20:00:00.000Z'));
    expect(watched()).toHaveLength(12);
  });

  it('keeps the show counter honest', () => {
    expect(db.getFirstSync<{ episodesSeen: number }>('SELECT episodesSeen FROM shows WHERE tvdbId = ?', [SHOW])?.episodesSeen).toBe(12);
  });
});
