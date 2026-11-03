/**
 * The pictures of a backup, kept BESIDE the ZIP rather than inside it.
 *
 * WHY (3 Nov). Every backup used to bundle every picture the library owns —
 * avatar, cover, TV Time's comment GIFs — into the one ZIP. A member who
 * imported 296 TV Time GIFs had a 540 MB ZIP, built in memory on the JS thread
 * each time the library changed: the app froze on open and never recovered
 * (OnePlus 10R). Reproduced on Android 14: 83 MB of native memory without the
 * files, 616 MB with them.
 *
 * So the ZIP lists the names (`imageFiles` in its sidecar) and each picture is
 * sent on its own, once. Names are unique and a file never changes under its
 * name, so "sent" is a set of names per destination, kept in `meta`, and the
 * next backup sends only what is new. One file in memory at a time, with a
 * yield between, so the app stays usable while a first backup catches up.
 *
 * Restoring fetches them BEFORE the import runs, because the importer links a
 * comment to its picture only if the file is already on disk.
 */
import { File, Paths } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';

import { getMeta, setMeta } from '@/db';
import { documentBytes } from '@/exporter';

/** Where one destination keeps the pictures. `get` answers null for a file it
 *  does not have, and throws only when it could not ask. */
export type ImageStore = {
  put(name: string, bytes: Uint8Array): Promise<void>;
  get(name: string): Promise<Uint8Array | null>;
};

export type ImageDest = 'icloud' | 'drive' | 'opentv' | 'webdav';

/** The folder the pictures go in, everywhere that has folders. */
export const IMAGES_FOLDER = 'OpenTV Images';

const sentKey = (dest: ImageDest): string => `backupImagesSent.${dest}`;

/** A name we wrote ourselves, never a path: refuse anything that could step
 *  outside the folder it is read into. */
export const safeImageName = (n: unknown): n is string =>
  typeof n === 'string' && n.length > 0 && n.length <= 200 && !n.includes('/') && !n.includes('\\') && !n.startsWith('.');

function sentSet(dest: ImageDest): Set<string> {
  try {
    return new Set(JSON.parse(getMeta(sentKey(dest)) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Start over for a destination — after it was turned off, or pointed
 *  somewhere new that has none of them. */
export function forgetSentImages(dest: ImageDest): void {
  setMeta(sentKey(dest), '');
}

/** The picture names a backup ZIP lists. Only the sidecar is unpacked. */
export function imageNamesIn(zip: Uint8Array): string[] {
  try {
    const files = unzipSync(zip, { filter: (f) => f.name === '_opentv_extras.json' });
    const raw = files['_opentv_extras.json'];
    if (!raw) return [];
    const list = (JSON.parse(strFromU8(raw)) as { imageFiles?: unknown }).imageFiles;
    return Array.isArray(list) ? list.filter(safeImageName) : [];
  } catch {
    return [];
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Send what this destination does not have yet. Throws on the first failure,
 * having recorded everything that landed before it, so the next backup carries
 * on where this one stopped.
 */
export async function sendImages(dest: ImageDest, names: string[], store: ImageStore): Promise<number> {
  const sent = sentSet(dest);
  let n = 0;
  for (const name of names) {
    if (sent.has(name) || !safeImageName(name)) continue;
    const bytes = documentBytes(name);
    // Gone from the phone (deleted, never downloaded): nothing to send, and
    // nothing to remember either, so a file that turns up later still goes.
    if (!bytes) continue;
    await store.put(name, bytes);
    sent.add(name);
    setMeta(sentKey(dest), JSON.stringify([...sent]));
    n++;
    await tick();
  }
  return n;
}

/**
 * Put the pictures a backup lists back on this phone, before it is imported.
 * A picture that cannot be fetched is skipped, never fatal: the library is the
 * backup, and a missing GIF must not stand between somebody and a decade.
 */
export async function fetchImages(dest: ImageDest, zip: Uint8Array, store: ImageStore): Promise<number> {
  const sent = sentSet(dest);
  let n = 0;
  for (const name of imageNamesIn(zip)) {
    try {
      const file = new File(Paths.document, name);
      if (file.exists) continue;
      const bytes = await store.get(name);
      if (!bytes) continue;
      file.writeSync(bytes);
      n++;
      // Fetched from there, so the next backup need not send it back. Only
      // what came FROM the store: a file already here may never have arrived
      // up there, if the phone that made this backup stopped part-way.
      sent.add(name);
    } catch {
      // Offline for one file, or out of disk. The rest still come back.
    }
    await tick();
  }
  setMeta(sentKey(dest), JSON.stringify([...sent]));
  return n;
}
