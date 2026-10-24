/**
 * Sync between one person's devices through THEIR OWN cloud — free (2.0.0).
 *
 * WHY THIS IS FREE AND THE SERVER RELAY IS NOT. The relay (`device-sync.ts`)
 * runs through OpenTV's server, which costs money per message and is Plus.
 * This runs through the person's iCloud (Apple devices) or Google Drive (any
 * device, iPhone ↔ Android included): their storage, their bandwidth, and not
 * one byte of it on our server. The offline-first promise holds trivially —
 * nothing per-episode leaves the phone except into the user's own account.
 *
 * SAME OPS, SAME APPLY. The ops are `sync-ops.ts`'s, queued in the same outbox
 * (`queueOp`), applied by the same `applyRemoteOps` under the same echo guard.
 * Only the transport differs: instead of a POST, each device writes its ops as
 * numbered chunk files it alone owns, and reads everybody else's. The folder
 * layout and every decision about it is `cloud-sync-plan.ts`.
 *
 * ONE ROAD AT A TIME. With OpenTV sync (Plus) also on, the server wins and
 * this stays quiet: the outbox is emptied by exactly one transport, so an op
 * cannot arrive twice by two roads — which for "+1 rewatch", the one op that
 * is not idempotent, would be a wrong number. `syncDevices` decides.
 *
 * HOW LONG IT TAKES. Drive answers at once, so a change arrives within one
 * poll (`POLL_MS` in device-sync, while the app is open on both). iCloud
 * delivers when the OS decides — usually a minute or two, sometimes longer —
 * and a file whose name has arrived without its bytes is simply waited for.
 * No push either way: a push would need our server.
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import ICloud from '../modules/icloud-drive';
import { runAfterInteractions } from '@/after-interactions';
import { dropOps, getMeta, notifyRemoteChange, pendingOps, setApplyingRemote, setMeta } from '@/db';
import { deviceId } from '@/device-id';
import { pickDeviceName } from '@/devices';
import {
  chunkName,
  compactable,
  freshOps,
  oldestKept,
  opNumber,
  parseChunk,
  parseName,
  parseStatus,
  planReads,
  skipAfterSeed,
  statusName,
  type Cursor,
  type Entry,
  type Status,
  type Via,
} from '@/cloud-sync-plan';
import { applyRemoteOps } from '@/sync-apply';
import type { RemoteOp } from '@/sync-ops';

export type { Via } from '@/cloud-sync-plan';

const VIA = 'cloudSync.via';
const AT = 'cloudSync.at';
const ERR = 'cloudSync.error';
// Per cloud, so switching from iCloud to Drive and back resumes where each
// folder left off rather than leaving a hole in this device's numbering.
const NEXT = (v: Via) => `cloudSync.next:${v}`;
const CURSORS = (v: Via) => `cloudSync.cursors:${v}`;
const SEEDED = (v: Via) => `cloudSync.seeded:${v}`;
const STATUS = (v: Via) => `cloudSync.status:${v}`;
const DEVICES = (v: Via) => `cloudSync.devices:${v}`;

/** Ops per chunk. The outbox hands them out 500 at a time already. */
const CHUNK_OPS = 500;
/** A status unchanged for this long is rewritten anyway, as a heartbeat:
 *  `at` is how other devices tell a sleeping phone from a lost one. */
const HEARTBEAT_MS = 6 * 3600_000;

const DEVICE_NAME = pickDeviceName(Device.deviceName, Device.modelName);

/** What the four folder calls need, whichever cloud is behind them. */
type Folder = {
  list(): Promise<Entry[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
};

/** The same backup ZIP the restore screens use — the only thing that can hand
 *  a new device the whole library. Resolves the backup's time, or null when
 *  there is none (an answer, not an error). */
type Seed = { restore(): Promise<number | null>; backUp(): Promise<unknown> };

export function cloudSyncVia(): Via | null {
  const v = getMeta(VIA);
  return v === 'icloud' || v === 'gdrive' ? v : null;
}

/**
 * Can this build do it? iCloud needs the 2.0.0 native module (`listFiles`
 * and friends); an older binary has the module without them and gets no
 * switch rather than a switch that does nothing.
 */
export function cloudSyncSupported(via: Via): boolean {
  if (via === 'icloud') return Platform.OS === 'ios' && typeof ICloud?.listFiles === 'function';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { driveSupported } = require('@/gdrive-backup') as typeof import('@/gdrive-backup');
  return driveSupported();
}

export function lastCloudSyncAt(): number | null {
  const n = Number(getMeta(AT));
  return n > 0 ? n : null;
}

export function lastCloudSyncError(): string | null {
  return getMeta(ERR) || null;
}

/** The other devices in this cloud's folder, as they last described themselves. */
export function cloudSyncDevices(): { dev: string; name: string | null; platform: string | null; at: number }[] {
  const via = cloudSyncVia();
  if (!via) return [];
  try {
    return JSON.parse(getMeta(DEVICES(via)) ?? '[]') as ReturnType<typeof cloudSyncDevices>;
  } catch {
    return [];
  }
}

export type CloudSyncOn = 'ok' | 'server-on' | 'icloud-off' | 'cancelled' | 'unauthorised' | 'no-play-services' | 'failed';

/**
 * Turn it on — the one call that may show a sheet (Google's, for Drive).
 *
 * THE BACKUP COMES WITH IT. A second device seeds from the backup ZIP in the
 * same cloud, so turning Drive sync on turns the Drive backup on too (the same
 * sign-in, one more permission) and writes a fresh copy now. iCloud's backup
 * is already automatic on every iPhone.
 */
export async function turnOnCloudSync(via: Via): Promise<CloudSyncOn> {
  // ONE ROAD AT A TIME: with OpenTV sync on, the server wins — refuse here
  // rather than only greying the switch, so no caller can start a second road.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { syncEnabled } = require('@/device-sync') as typeof import('@/device-sync');
  if (syncEnabled()) return 'server-on';
  if (via === 'icloud') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { icloudAvailableAsync } = require('@/backup') as typeof import('@/backup');
    if (!(await icloudAvailableAsync())) return 'icloud-off';
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { connectDrive } = require('@/gdrive-backup') as typeof import('@/gdrive-backup');
    const r = await connectDrive(true);
    if (r !== 'ok') return r;
  }
  // Before the first op is queued: an op id is `<device>:<n>`, and a device
  // without its name yet would stamp them all `d:`.
  deviceId();
  setMeta(VIA, via);
  setMeta(ERR, '');
  failures = 0;
  retryAt = 0;
  statusCache.clear();
  void seedFor(via)
    .backUp()
    .catch(() => {});
  void cloudSyncNow().catch(() => {});
  return 'ok';
}

/** Off locally. The files stay in the person's cloud — their data, their call —
 *  and a device that comes back later catches up from them or from the backup. */
export function turnOffCloudSync(): void {
  setMeta(VIA, '');
}

// ── the two clouds ──────────────────────────────────────────────────────────

function icloudFolder(): Folder | null {
  const m = ICloud;
  if (!m?.listFiles || !m.readText || !m.writeText || !m.deleteFile) return null;
  // Called ON the module, never detached: a native module's functions are
  // not promised to work without their object.
  return {
    list: () => m.listFiles!(),
    // Ten seconds: long enough for a small file iCloud already knows about,
    // short enough that a run waiting on the OS does not hold the next one up.
    // A chunk that times out is simply read on a later run.
    read: (name) => m.readText!(name, 10_000),
    write: (name, text) => m.writeText!(name, text),
    remove: (name) => m.deleteFile!(name),
  };
}

async function openFolder(via: Via): Promise<Folder | null> {
  if (via === 'icloud') return icloudFolder();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { driveSyncFolder } = require('@/gdrive-backup') as typeof import('@/gdrive-backup');
  return driveSyncFolder();
}

function seedFor(via: Via): Seed {
  if (via === 'icloud') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const b = require('@/backup') as typeof import('@/backup');
    return {
      async restore() {
        const found = await b.findCloudBackup();
        if (!found) return null;
        await b.restoreFromCloud(() => {});
        return found.modifiedAt ?? Date.now();
      },
      backUp: () => b.backupNow(true),
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const d = require('@/gdrive-backup') as typeof import('@/gdrive-backup');
  return {
    async restore() {
      const found = await d.findDriveBackup();
      if (!found) return null;
      await d.restoreFromDrive(() => {});
      return found.modifiedAt ?? Date.now();
    },
    backUp: () => d.driveBackupNow(true),
  };
}

/**
 * TAKE THE BACKUP, merged, under the echo guard — the cloud's version of the
 * relay's `seedFromBackup`, for the same reason: a second device that turned
 * sync on would otherwise sit empty until its owner next watched something.
 * The import MERGES, so a device that had everything loses nothing. And the
 * union goes back up, so the next newcomer gets this device's rows too.
 *
 * Not while the app is still opening: a whole library through the importer on
 * top of the first paint is what the relay learned not to do.
 */
async function takeBackup(via: Via): Promise<number | null> {
  await new Promise<void>((resolve) => {
    runAfterInteractions(() => resolve());
  });
  const seed = seedFor(via);
  let at: number | null;
  setApplyingRemote(true);
  try {
    at = await seed.restore();
  } finally {
    setApplyingRemote(false);
  }
  if (at != null) {
    notifyRemoteChange();
    void seed.backUp().catch(() => {});
  }
  return at;
}

// ── one run ─────────────────────────────────────────────────────────────────

let running = false;
/**
 * BACK OFF ON FAILURE. The relay's poll calls in every 20 seconds while the
 * app is open; a Drive that answers 403, or an iCloud that is signed out,
 * would otherwise be asked the same doomed question three times a minute.
 * Doubling from 20 s to ten minutes; any success resets it.
 */
let failures = 0;
let retryAt = 0;
/** Statuses already read, by name and the time the cloud says they changed. */
const statusCache = new Map<string, { modifiedAt: number; status: Status }>();

function readCursors(via: Via): Record<string, Cursor> {
  try {
    const raw = JSON.parse(getMeta(CURSORS(via)) ?? '{}') as Record<string, Cursor>;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** Write this device's ops out, a chunk at a time, oldest first. */
async function push(folder: Folder, via: Via, me: string): Promise<number | null> {
  let first: number | null = null;
  for (;;) {
    const out = pendingOps(CHUNK_OPS);
    if (out.length === 0) return first;
    const k = Number(getMeta(NEXT(via))) || 1;
    /*
     * THE NUMBER IS TAKEN BEFORE THE WRITE. If it were taken after, a crash in
     * between would rewrite chunk k with MORE ops than another device may
     * already have read as k — and moved its cursor past. Taken first, a crash
     * costs at worst a duplicate chunk, whose ops the reader's op-number guard
     * skips. A write that fails gives the number back.
     */
    setMeta(NEXT(via), String(k + 1));
    try {
      await folder.write(chunkName(me, k), JSON.stringify({ v: 1, dev: me, k, ops: out }));
    } catch (e) {
      setMeta(NEXT(via), String(k));
      throw e;
    }
    first ??= k;
    dropOps(out.map((o) => o.id));
  }
}

async function readStatuses(folder: Folder, entries: readonly Entry[], me: string): Promise<Record<string, Status>> {
  const out: Record<string, Status> = {};
  for (const e of entries) {
    const p = parseName(e.name);
    if (p?.kind !== 'device' || p.dev === me || !e.ready) continue;
    const hit = statusCache.get(e.name);
    if (hit && hit.modifiedAt === e.modifiedAt) {
      out[p.dev] = hit.status;
      continue;
    }
    try {
      const s = parseStatus(await folder.read(e.name));
      if (s && s.dev === p.dev) {
        statusCache.set(e.name, { modifiedAt: e.modifiedAt, status: s });
        out[p.dev] = s;
      }
    } catch {
      // Not delivered yet, or half-written. Last run's copy, if any, stands.
      if (hit) out[p.dev] = hit.status;
    }
  }
  return out;
}

/**
 * Say what happened here, hear what happened there, tidy up after myself.
 * Called by `syncDevices` whenever the server relay is not the one in use —
 * so on launch, on leaving the app, a second after a tick, and on the relay's
 * poll while the app is open.
 */
export async function cloudSyncNow(): Promise<'done' | 'off' | 'failed'> {
  const via = cloudSyncVia();
  if (!via) return 'off';
  if (running) return 'done';
  if (Date.now() < retryAt) return 'failed';
  running = true;
  try {
    const folder = await openFolder(via);
    if (!folder) throw new Error(via === 'icloud' ? 'iCloud is not available' : 'Not connected to Google Drive');
    const me = deviceId();

    const wroteFrom = await push(folder, via, me);
    const entries = await folder.list();
    const statuses = await readStatuses(folder, entries, me);

    // ONCE PER CLOUD: take the backup, so a second device starts whole. A run
    // that cannot reach the backup throws and asks again; "no backup" is an
    // answer and earns the stamp.
    let zipAt: number | null = null;
    if (getMeta(SEEDED(via)) !== '1') {
      zipAt = await takeBackup(via);
      setMeta(SEEDED(via), '1');
    }

    const now = Date.now();
    const cursors = readCursors(via);
    const plans = planReads(entries, me, cursors, statuses, now);
    // TOO LONG AWAY: the chunks this device needed have been tidied. The
    // backup is the one thing that can make it current, and it merges.
    if (plans.some((p) => p.reset) && zipAt == null) zipAt = await takeBackup(via);
    for (const p of plans) {
      const c = cursors[p.dev];
      if (!c || p.reset) cursors[p.dev] = { k: p.from, n: c?.n ?? 0 };
    }

    // Gather, then apply in the order the person acted across all devices.
    type Tagged = RemoteOp & { id: string; dev: string };
    const batch: Tagged[] = [];
    const lastK: Record<string, number> = {};
    let seq = 0;
    for (const p of plans) {
      for (const name of p.chunks) {
        let text: string;
        try {
          text = await folder.read(name);
        } catch {
          break; // not here yet; keep the order and come back for it
        }
        const k = (parseName(name) as { k: number }).k;
        const chunk = parseChunk(text);
        // An unreadable chunk is passed over, not waited on: it will not
        // become readable, and waiting would deafen this device to that one.
        if (chunk) for (const op of freshOps(chunk, cursors[p.dev])) batch.push({ ...op, seq: seq++, dev: p.dev });
        lastK[p.dev] = k;
      }
    }

    const save = () => setMeta(CURSORS(via), JSON.stringify(cursors));
    applyRemoteOps(
      batch,
      (op) => {
        const c = cursors[op.dev]!;
        c.n = Math.max(c.n, opNumber(op.id));
        save();
      },
      (_a, op) => skipAfterSeed(op.kind, op.ts, zipAt),
    );
    for (const [dev, k] of Object.entries(lastK)) cursors[dev]!.k = k;
    save();

    // Tidy my own chunks, announcing the new `oldest` BEFORE deleting, so a
    // reader never finds a hole its writer has not explained.
    const next = Number(getMeta(NEXT(via))) || 1;
    const dels = compactable(entries, me, statuses, now);
    const oldest = oldestKept(entries, me, dels, wroteFrom ?? next);
    const read: Record<string, number> = {};
    for (const [dev, c] of Object.entries(cursors)) read[dev] = c.k;
    const body = { v: 1, dev: me, name: DEVICE_NAME, platform: Platform.OS, oldest, read };
    const sig = JSON.stringify(body);
    const [lastSig, lastAt] = (getMeta(STATUS(via)) ?? '').split('\n');
    if (sig !== lastSig || now - (Number(lastAt) || 0) > HEARTBEAT_MS) {
      await folder.write(statusName(me), JSON.stringify({ ...body, at: now }));
      setMeta(STATUS(via), `${sig}\n${now}`);
    }
    for (const k of dels) {
      try {
        await folder.remove(chunkName(me, k));
      } catch {
        // Tried again next run; a chunk left over costs a listing line.
      }
    }

    setMeta(
      DEVICES(via),
      JSON.stringify(
        Object.values(statuses).map((s) => ({ dev: s.dev, name: s.name, platform: s.platform, at: s.at })),
      ),
    );
    setMeta(AT, String(Date.now()));
    setMeta(ERR, '');
    failures = 0;
    retryAt = 0;
    return 'done';
  } catch (e) {
    failures += 1;
    retryAt = Date.now() + Math.min(20_000 * 2 ** (failures - 1), 600_000);
    setMeta(ERR, (e instanceof Error ? e.message : String(e)).slice(0, 200));
    return 'failed';
  } finally {
    running = false;
  }
}
