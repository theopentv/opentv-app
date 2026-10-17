import {
  chunkName,
  compactable,
  freshOps,
  HOLE_GIVE_UP_MS,
  KEEP_AT_LEAST_MS,
  KEEP_AT_MOST_MS,
  oldestKept,
  opNumber,
  parseChunk,
  parseName,
  parseStatus,
  planReads,
  skipAfterSeed,
  STALE_DEVICE_MS,
  statusName,
  type Entry,
  type Status,
} from '@/cloud-sync-plan';
import { makeOp } from '@/sync-ops';

/**
 * Sync through the user's own cloud. What can go wrong here without anybody
 * noticing until their library is wrong:
 *
 *  1. A CHUNK SKIPPED FOR GOOD because a later one was read first — iCloud
 *     names files in no promised order.
 *  2. A DEVICE DEAFENED for ever by a hole that will never fill.
 *  3. A CHUNK DELETED before somebody who needed it read it, with no reset.
 *  4. "+1 REWATCH" counted twice, by a crash replay or by a seed.
 */

const NOW = 1_800_000_000_000;
const HOUR = 3600_000;
const e = (name: string, ageMs = HOUR, ready = true): Entry => ({ name, modifiedAt: NOW - ageMs, ready });
const status = (dev: string, over: Partial<Status> = {}): Status => ({
  v: 1,
  dev,
  name: null,
  platform: null,
  at: NOW - HOUR,
  oldest: 1,
  read: {},
  ...over,
});

describe('names', () => {
  it('round-trip a chunk and a status', () => {
    expect(parseName(chunkName('abc123', 7))).toEqual({ kind: 'ops', dev: 'abc123', k: 7 });
    expect(parseName(statusName('abc123'))).toEqual({ kind: 'device', dev: 'abc123' });
  });

  it('ignore anything else in the folder', () => {
    for (const n of ['OpenTV Backup.zip', 'ops.abc.json', 'ops.a.b.1.json', 'ops..1.json', 'device.json', 'ops.abc.x.json']) {
      expect(parseName(n)).toBeNull();
    }
  });

  it('read the counter off an op id', () => {
    expect(opNumber('abc123:42')).toBe(42);
    expect(opNumber('d:7')).toBe(7);
    expect(opNumber('garbage')).toBe(0);
  });
});

describe('what to read', () => {
  it('never reads its own chunks', () => {
    expect(planReads([e(chunkName('me', 1))], 'me', {}, { me: status('me') }, NOW)).toEqual([]);
  });

  it('reads a known device from its cursor, in order', () => {
    const entries = [e(chunkName('b', 3)), e(chunkName('b', 1)), e(chunkName('b', 2))];
    const [p] = planReads(entries, 'me', { b: { k: 1, n: 10 } }, {}, NOW);
    expect(p!.chunks).toEqual([chunkName('b', 2), chunkName('b', 3)]);
    expect(p!.reset).toBe(false);
  });

  it('waits for a newcomer whose status has not arrived — its first chunk is not known to be first', () => {
    expect(planReads([e(chunkName('b', 5))], 'me', {}, {}, NOW)).toEqual([]);
  });

  it('starts a newcomer at the oldest chunk its writer keeps', () => {
    const entries = [e(chunkName('b', 4)), e(chunkName('b', 5))];
    const [p] = planReads(entries, 'me', {}, { b: status('b', { oldest: 4 }) }, NOW);
    expect(p).toEqual({ dev: 'b', chunks: [chunkName('b', 4), chunkName('b', 5)], reset: false, from: 3 });
  });

  it('stops at a hole rather than skipping past it (1)', () => {
    const entries = [e(chunkName('b', 2)), e(chunkName('b', 4))];
    const [p] = planReads(entries, 'me', { b: { k: 1, n: 0 } }, {}, NOW);
    expect(p!.chunks).toEqual([chunkName('b', 2)]);
  });

  it('stops at a chunk named but not delivered', () => {
    const entries = [e(chunkName('b', 2), HOUR, false), e(chunkName('b', 3))];
    expect(planReads(entries, 'me', { b: { k: 1, n: 0 } }, {}, NOW)).toEqual([]);
  });

  it('gives up on a hole once the chunk after it is a day old (2)', () => {
    const entries = [e(chunkName('b', 4), HOLE_GIVE_UP_MS + 1)];
    const [p] = planReads(entries, 'me', { b: { k: 2, n: 0 } }, {}, NOW);
    expect(p!.chunks).toEqual([chunkName('b', 4)]);
  });

  it('resets when the writer says the needed chunks are gone (3)', () => {
    const entries = [e(chunkName('b', 9)), e(chunkName('b', 10))];
    const [p] = planReads(entries, 'me', { b: { k: 3, n: 50 } }, { b: status('b', { oldest: 9 }) }, NOW);
    expect(p).toEqual({ dev: 'b', chunks: [chunkName('b', 9), chunkName('b', 10)], reset: true, from: 8 });
  });

  it('does not reset on a gap in the listing alone — iCloud may still be naming them', () => {
    const entries = [e(chunkName('b', 9))];
    expect(planReads(entries, 'me', { b: { k: 3, n: 0 } }, { b: status('b', { oldest: 4 }) }, NOW)).toEqual([]);
  });
});

describe('op replay guard (4)', () => {
  it('skips ops already applied when a chunk is read again', () => {
    const ops = [1, 2, 3].map((n) => makeOp('b', n, { t: 'rewatch', show: 1, s: 1, e: n }));
    const chunk = { v: 1 as const, dev: 'b', k: 1, ops };
    expect(freshOps(chunk, { k: 0, n: 2 }).map((o) => o.id)).toEqual(['b:3']);
    expect(freshOps(chunk, undefined)).toHaveLength(3);
  });

  it('skips a rewatch already in the seed backup, and only a rewatch', () => {
    expect(skipAfterSeed('rewatch', 100, 200)).toBe(true);
    expect(skipAfterSeed('movieRewatch', 200, 200)).toBe(true);
    expect(skipAfterSeed('rewatch', 300, 200)).toBe(false);
    expect(skipAfterSeed('watch', 100, 200)).toBe(false);
    expect(skipAfterSeed('rewatch', 100, null)).toBe(false);
  });
});

describe('parsing what is in the folder', () => {
  it('takes a chunk and drops malformed ops inside it', () => {
    const good = makeOp('b', 1, { t: 'unwatch', show: 1, s: 1, e: 1 });
    const c = parseChunk(JSON.stringify({ v: 1, dev: 'b', k: 1, ops: [good, { id: 3 }, null] }));
    expect(c!.ops).toEqual([good]);
  });

  it('refuses a half-written file or a newer format, without throwing', () => {
    expect(parseChunk('{"v":1,"dev":"b"')).toBeNull();
    expect(parseChunk(JSON.stringify({ v: 2, dev: 'b', k: 1, ops: [] }))).toBeNull();
    expect(parseStatus('nope')).toBeNull();
  });

  it('keeps only numeric read cursors from a status', () => {
    const s = parseStatus(JSON.stringify({ v: 1, dev: 'b', at: 1, oldest: 2, read: { me: 4, x: 'y' } }));
    expect(s!.read).toEqual({ me: 4 });
  });
});

describe('compaction', () => {
  const mine = (k: number, age: number) => e(chunkName('me', k), age);

  it('deletes a chunk every recent device has read, once it is a day old', () => {
    const entries = [mine(1, KEEP_AT_LEAST_MS + 1), mine(2, KEEP_AT_LEAST_MS + 1), mine(3, KEEP_AT_LEAST_MS + 1)];
    const statuses = { b: status('b', { read: { me: 2 } }), c: status('c', { read: { me: 3 } }) };
    expect(compactable(entries, 'me', statuses, NOW)).toEqual([1, 2]);
  });

  it('keeps a read chunk younger than a day, for a newcomer seeding from a lagging backup', () => {
    expect(compactable([mine(1, HOUR)], 'me', { b: status('b', { read: { me: 1 } }) }, NOW)).toEqual([]);
  });

  it('keeps everything for a lone device until a month has passed', () => {
    const entries = [mine(1, KEEP_AT_LEAST_MS + 1), mine(2, KEEP_AT_MOST_MS + 1)];
    expect(compactable(entries, 'me', {}, NOW)).toEqual([2]);
  });

  it('lets a device silent for a month stop holding chunks hostage', () => {
    const entries = [mine(1, KEEP_AT_LEAST_MS + 1)];
    const statuses = { b: status('b', { read: {}, at: NOW - STALE_DEVICE_MS - 1 }), c: status('c', { read: { me: 1 } }) };
    expect(compactable(entries, 'me', statuses, NOW)).toEqual([1]);
  });

  it('never touches another device’s chunks', () => {
    expect(compactable([e(chunkName('b', 1), KEEP_AT_MOST_MS + 1)], 'me', {}, NOW)).toEqual([]);
  });

  it('announces the oldest chunk still kept, or the next one when none is', () => {
    const entries = [mine(1, 0), mine(2, 0), mine(3, 0)];
    expect(oldestKept(entries, 'me', [1], 4)).toBe(2);
    expect(oldestKept(entries, 'me', [1, 2, 3], 4)).toBe(4);
    // A chunk written this run but not listed yet still bounds it.
    expect(oldestKept([], 'me', [], 3)).toBe(3);
  });
});
