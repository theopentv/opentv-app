import { strToU8, zipSync } from 'fflate';

const meta = new Map<string, string>();
const disk = new Map<string, Uint8Array>();

jest.mock('@/db', () => ({ getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => meta.set(k, v) }));
jest.mock('@/exporter', () => ({ documentBytes: (n: string) => disk.get(n) ?? null }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    name: string;
    constructor(_dir: string, name: string) {
      this.name = name;
    }
    get exists() {
      return disk.has(this.name);
    }
    writeSync(b: Uint8Array) {
      disk.set(this.name, b);
    }
  },
}));

import { fetchImages, imageNamesIn, sendImages, type ImageStore } from '@/backup-images';

const zipListing = (names: unknown[]) => zipSync({ '_opentv_extras.json': strToU8(JSON.stringify({ imageFiles: names })) });

function memoryStore(): ImageStore & { put: jest.Mock; held: Map<string, Uint8Array> } {
  const held = new Map<string, Uint8Array>();
  return {
    held,
    put: jest.fn(async (n: string, b: Uint8Array) => void held.set(n, b)),
    get: async (n: string) => held.get(n) ?? null,
  };
}

beforeEach(() => {
  meta.clear();
  disk.clear();
});

test('the ZIP lists picture names, never a path', () => {
  expect(imageNamesIn(zipListing(['a.gif', '../x', '.hidden', 7, 'b.jpg']))).toEqual(['a.gif', 'b.jpg']);
  expect(imageNamesIn(zipSync({ 'x.csv': strToU8('') }))).toEqual([]);
});

test('each picture is sent once, and a later backup sends only what is new', async () => {
  disk.set('a.gif', new Uint8Array([1]));
  disk.set('b.gif', new Uint8Array([2]));
  const store = memoryStore();
  expect(await sendImages('drive', ['a.gif', 'b.gif', 'gone.gif'], store)).toBe(2);
  disk.set('c.gif', new Uint8Array([3]));
  expect(await sendImages('drive', ['a.gif', 'b.gif', 'c.gif'], store)).toBe(1);
  expect(store.put).toHaveBeenCalledTimes(3);
  // another destination has none of them
  expect(await sendImages('opentv', ['a.gif'], memoryStore())).toBe(1);
});

test('a failure part-way keeps what landed, so the next run carries on', async () => {
  disk.set('a.gif', new Uint8Array([1]));
  disk.set('b.gif', new Uint8Array([2]));
  const store = memoryStore();
  store.put.mockImplementationOnce(async (n, b) => void store.held.set(n, b)).mockRejectedValueOnce(new Error('offline'));
  await expect(sendImages('drive', ['a.gif', 'b.gif'], store)).rejects.toThrow('offline');
  store.put.mockImplementation(async (n, b) => void store.held.set(n, b));
  expect(await sendImages('drive', ['a.gif', 'b.gif'], store)).toBe(1);
});

test('a restore puts the pictures back before the import, and skips ones it cannot get', async () => {
  const store = memoryStore();
  store.held.set('a.gif', new Uint8Array([1]));
  disk.set('b.gif', new Uint8Array([2]));
  expect(await fetchImages('icloud', zipListing(['a.gif', 'b.gif', 'missing.gif']), store)).toBe(1);
  expect(disk.get('a.gif')).toEqual(new Uint8Array([1]));
  // what came from there is not sent back; what was only on the phone is
  expect(await sendImages('icloud', ['a.gif', 'b.gif'], store)).toBe(1);
  expect(store.put).toHaveBeenCalledWith('b.gif', new Uint8Array([2]));
});
