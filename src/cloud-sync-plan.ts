/**
 * Sync through the user's OWN cloud — the decisions, kept pure (2.0.0).
 *
 * WHAT THE FOLDER HOLDS. The same ops `device-sync.ts` sends to our server
 * (`sync-ops.ts`, unchanged), written instead into a folder in the person's
 * iCloud or Google Drive. Two kinds of file, and every one of them is written
 * by exactly ONE device:
 *
 *   ops.<device>.<k>.json   a chunk: what that device did, k = 1, 2, 3 …
 *   device.<device>.json    its status: its name, how far it has read every
 *                           other device, and the oldest chunk it still keeps
 *
 * ONE WRITER PER FILE is the whole design. Neither iCloud nor Drive offers a
 * lock, and both settle a conflict by quietly keeping one side; a file only
 * one device ever writes cannot have a conflict. Nobody rewrites anybody
 * else's data, so nothing can be lost to a race.
 *
 * FLAT, NOT A FOLDER PER DEVICE. Drive's app folder has no folders worth the
 * name, and one listing of one directory is the cheapest question both clouds
 * answer. The device is in the file name, so the device list falls out of the
 * listing either way.
 *
 * Applying is `sync-apply.ts`; talking to the cloud is `cloud-sync.ts`. This
 * file decides what to read, what to skip and what may be deleted, which is
 * where a mistake costs somebody their library without anybody noticing.
 */
import type { Op } from '@/sync-ops';

export type Via = 'icloud' | 'gdrive';

/** One file the cloud says it has. `ready` = its bytes are on this device
 *  (iCloud delivers names before contents, on its own schedule). */
export type Entry = { name: string; modifiedAt: number; ready: boolean };

export type Chunk = { v: 1; dev: string; k: number; ops: Op[] };

export type Status = {
  v: 1;
  dev: string;
  name: string | null;
  platform: string | null;
  /** When this device last wrote its status — a heartbeat. */
  at: number;
  /** The smallest chunk number it still keeps; its next chunk when it keeps none. */
  oldest: number;
  /** Highest chunk number it has fully applied, per other device. */
  read: Record<string, number>;
};

/** Where this device has got to with another: `k` = last chunk fully
 *  applied, `n` = highest op number applied (the crash-replay guard). */
export type Cursor = { k: number; n: number };

const DEV = /^[a-z0-9]{1,40}$/i;

export const chunkName = (dev: string, k: number): string => `ops.${dev}.${k}.json`;
export const statusName = (dev: string): string => `device.${dev}.json`;

export function parseName(name: string): { kind: 'ops'; dev: string; k: number } | { kind: 'device'; dev: string } | null {
  let m = /^ops\.([^.]+)\.(\d+)\.json$/.exec(name);
  if (m && DEV.test(m[1]!)) return { kind: 'ops', dev: m[1]!, k: Number(m[2]) };
  m = /^device\.([^.]+)\.json$/.exec(name);
  if (m && DEV.test(m[1]!)) return { kind: 'device', dev: m[1]! };
  return null;
}

/** The counter half of an op id (`<device>:<n>`, see `opId`), or 0. */
export function opNumber(id: string): number {
  const n = Number(id.slice(id.lastIndexOf(':') + 1));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A HOLE IS GIVEN UP ON AFTER A DAY. Chunks are numbered without gaps, so a
 * missing one is normally iCloud still delivering it, and the right thing is
 * to wait. But a chunk whose write failed half-way can leave a number that
 * will never arrive, and waiting for it for ever would deafen this device to
 * that one for good. Once the chunk AFTER the hole is a day old, the hole is
 * not coming.
 */
export const HOLE_GIVE_UP_MS = 24 * 3600_000;

export type ReadPlan = {
  dev: string;
  /** Chunk names to read, in order, contiguous from the cursor. */
  chunks: string[];
  /**
   * The chunks this device needed were deleted by their writer (compaction)
   * before it read them: no sequence of ops can make it current any more, and
   * the full backup is the one thing that can. Same answer as the server
   * relay's `reset`.
   */
  reset: boolean;
  /** Where the cursor starts after a reset (or for a device never seen). */
  from: number;
};

/**
 * What to read from every OTHER device this round.
 *
 * A DEVICE NEVER SEEN BEFORE starts at its oldest chunk, without a reset: the
 * seed (`cloud-sync.ts`) has already taken the library from the backup, and
 * whatever that device still keeps is the recent past laid on top — exactly
 * what the server relay does for a new phone.
 */
export function planReads(
  entries: readonly Entry[],
  me: string,
  cursors: Readonly<Record<string, Cursor>>,
  statuses: Readonly<Record<string, Status>>,
  now: number,
): ReadPlan[] {
  const byDev = new Map<string, Map<number, Entry>>();
  for (const e of entries) {
    const p = parseName(e.name);
    if (!p || p.kind !== 'ops' || p.dev === me) continue;
    let m = byDev.get(p.dev);
    if (!m) byDev.set(p.dev, (m = new Map()));
    m.set(p.k, e);
  }

  const plans: ReadPlan[] = [];
  for (const [dev, chunks] of byDev) {
    const ks = [...chunks.keys()].sort((a, b) => a - b);
    const cur = cursors[dev];
    // A NEWCOMER IS READ ONLY ONCE ITS STATUS HAS ARRIVED. Without it, the
    // first chunk listed is not known to be its first: iCloud delivers names
    // in no promised order, and starting at chunk 5 because 1–4 had not been
    // named yet would skip them for good. The writer's `oldest` settles it.
    if (!cur && !statuses[dev]) continue;
    const oldest = statuses[dev]?.oldest ?? ks[0]!;
    let from = cur ? cur.k : Math.min(ks[0]!, oldest) - 1;
    // Only on the writer's own word: a gap in the LISTING alone may be iCloud
    // not having delivered the names yet, which the hole rule waits out.
    const reset = cur != null && statuses[dev] != null && oldest > cur.k + 1;
    if (reset) from = oldest - 1;

    const out: string[] = [];
    let k = from;
    for (const next of ks) {
      if (next <= k) continue;
      const e = chunks.get(next)!;
      // Contiguous only: a later chunk read before an earlier one arrives
      // would move the cursor past the earlier one, which would then never
      // be read. A hole is waited for — unless it has had a day.
      if (next !== k + 1 && now - e.modifiedAt < HOLE_GIVE_UP_MS) break;
      // Named but not delivered: wait for iCloud, keep the order.
      if (!e.ready) break;
      out.push(e.name);
      k = next;
    }
    if (out.length || reset) plans.push({ dev, chunks: out, reset, from });
  }
  return plans;
}

/** The ops of a chunk this device has not applied yet (crash replay guard). */
export function freshOps(chunk: Chunk, cursor: Cursor | undefined): Op[] {
  const n = cursor?.n ?? 0;
  return chunk.ops.filter((o) => opNumber(o.id) > n);
}

/**
 * A chunk read from the cloud, or null. Anything else in the folder — a
 * half-written file, a newer build's format — is skipped, never thrown on.
 */
export function parseChunk(text: string): Chunk | null {
  try {
    const j = JSON.parse(text) as Partial<Chunk>;
    if (j?.v !== 1 || typeof j.dev !== 'string' || typeof j.k !== 'number' || !Array.isArray(j.ops)) return null;
    const ops = j.ops.filter(
      (o): o is Op =>
        !!o && typeof o.id === 'string' && typeof o.ts === 'number' && typeof o.kind === 'string' && typeof o.payload === 'string',
    );
    return { v: 1, dev: j.dev, k: j.k, ops };
  } catch {
    return null;
  }
}

export function parseStatus(text: string): Status | null {
  try {
    const j = JSON.parse(text) as Partial<Status>;
    if (j?.v !== 1 || typeof j.dev !== 'string' || typeof j.oldest !== 'number' || typeof j.at !== 'number') return null;
    const read: Record<string, number> = {};
    for (const [d, k] of Object.entries(j.read ?? {})) if (typeof k === 'number') read[d] = k;
    return {
      v: 1,
      dev: j.dev,
      name: typeof j.name === 'string' ? j.name : null,
      platform: typeof j.platform === 'string' ? j.platform : null,
      at: j.at,
      oldest: j.oldest,
      read,
    };
  } catch {
    return null;
  }
}

/** A device that has not been heard from in a month no longer holds anybody's chunks hostage. */
export const STALE_DEVICE_MS = 30 * 24 * 3600_000;
/**
 * NOTHING YOUNGER THAN A DAY IS DELETED, even once every device has read it.
 * A THIRD device arriving later seeds from the backup ZIP, and the ZIP is
 * rewritten when somebody leaves the app — so for a while it lags the ops.
 * A day of overlap means the newcomer's ZIP plus the surviving chunks covers
 * everything.
 */
export const KEEP_AT_LEAST_MS = 24 * 3600_000;
/** And nothing is kept past a month, read or not, so a lone device's folder stays bounded. */
export const KEEP_AT_MOST_MS = 30 * 24 * 3600_000;

/**
 * Which of MY OWN chunks I may delete. Only ever my own — one writer per file.
 *
 * A chunk goes once it is a day old AND every device heard from this month
 * has read it, or once it is a month old regardless. A device that comes
 * back after that finds its chunks gone, sees `oldest` past its cursor, and
 * takes the backup instead (`reset`) — which merges, so it loses nothing.
 */
export function compactable(
  entries: readonly Entry[],
  me: string,
  statuses: Readonly<Record<string, Status>>,
  now: number,
): number[] {
  const others = Object.values(statuses).filter((s) => s.dev !== me && now - s.at < STALE_DEVICE_MS);
  const allRead = others.length ? Math.min(...others.map((s) => s.read[me] ?? 0)) : 0;
  const out: number[] = [];
  for (const e of entries) {
    const p = parseName(e.name);
    if (!p || p.kind !== 'ops' || p.dev !== me) continue;
    const age = now - e.modifiedAt;
    if (age >= KEEP_AT_MOST_MS || (age >= KEEP_AT_LEAST_MS && others.length > 0 && p.k <= allRead)) out.push(p.k);
  }
  return out.sort((a, b) => a - b);
}

/** The `oldest` my status should announce once `deleting` are gone. */
export function oldestKept(entries: readonly Entry[], me: string, deleting: readonly number[], next: number): number {
  const gone = new Set(deleting);
  let oldest = next;
  for (const e of entries) {
    const p = parseName(e.name);
    if (p?.kind === 'ops' && p.dev === me && !gone.has(p.k) && p.k < oldest) oldest = p.k;
  }
  return oldest;
}

/**
 * THE SEED'S REWATCHES ARE ALREADY IN THE ZIP. A new device takes the backup
 * and then replays whatever chunks are still kept, and every op but one is
 * harmless to replay — "+1 rewatch" adds. So right after a seed or a reset,
 * a rewatch older than the backup it came with is skipped.
 */
export function skipAfterSeed(kind: string, ts: number, zipAt: number | null): boolean {
  return zipAt != null && ts <= zipAt && (kind === 'rewatch' || kind === 'movieRewatch');
}
