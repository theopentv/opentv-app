/**
 * `fetchToDocuments` must stream to disk, never buffer a body in JS.
 *
 * The OOM it replaced (21 Oct 2026, Android, `ResponseSink.finalize`) came from
 * `fetch(url).arrayBuffer()` on hundreds of approved comment GIFs at launch.
 * So the first assertion is the point: global `fetch` is never touched.
 */
const downloads: { url: string; uri: string; idempotent?: boolean; signal?: AbortSignal }[] = [];
const onDisk = new Set<string>();
let behave: 'ok' | '404' | 'hang' | 'offline' = 'ok';

jest.mock('expo-file-system', () => {
  class File {
    readonly uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return onDisk.has(this.uri);
    }
    delete() {
      onDisk.delete(this.uri);
    }
    static async downloadFileAsync(url: string, dest: File, opts: { idempotent?: boolean; signal?: AbortSignal }) {
      downloads.push({ url, uri: dest.uri, ...opts });
      if (behave === 'ok') {
        onDisk.add(dest.uri);
        return dest;
      }
      // Android writes as it reads, so a failure can leave a partial file.
      onDisk.add(dest.uri);
      if (behave === '404') throw new Error('UnableToDownload: response has status: 404');
      if (behave === 'offline') throw new Error('Unable to download a file: java.net.UnknownHostException');
      return new Promise((_, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    }
  }
  return { File, Paths: { document: 'file:///docs' } };
});

// eslint-disable-next-line import/first
import { fetchToDocuments } from './fetch-to-documents';
// eslint-disable-next-line import/first
import { netIsOpen, netReset } from './net-circuit';

const realFetch = global.fetch;

beforeEach(() => {
  downloads.length = 0;
  onDisk.clear();
  behave = 'ok';
  netReset();
  global.fetch = jest.fn(() => {
    throw new Error('fetch must not be used: it buffers the whole body in memory');
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = realFetch;
});

test('streams straight into Documents, never through fetch', async () => {
  await expect(fetchToDocuments('https://x/a.gif', 'comment-img-bg-1.gif')).resolves.toBe('comment-img-bg-1.gif');
  expect(global.fetch).not.toHaveBeenCalled();
  expect(downloads).toEqual([
    expect.objectContaining({ url: 'https://x/a.gif', uri: 'file:///docs/comment-img-bg-1.gif', idempotent: true }),
  ]);
  expect(onDisk.has('file:///docs/comment-img-bg-1.gif')).toBe(true);
});

test('a 404 is null, leaves no partial file, and does not trip the breaker', async () => {
  behave = '404';
  await expect(fetchToDocuments('https://x/gone.gif', 'g.gif')).resolves.toBeNull();
  expect(onDisk.size).toBe(0);
  expect(netIsOpen()).toBe(false);
});

test('a hanging link is aborted at the timeout, natively, and cleaned up', async () => {
  behave = 'hang';
  await expect(fetchToDocuments('https://x/slow.gif', 's.gif', 10)).resolves.toBeNull();
  expect(downloads[0].signal?.aborted).toBe(true);
  expect(onDisk.size).toBe(0);
});

test('offline opens the breaker, and the next call does not even start a download', async () => {
  behave = 'offline';
  let tries = 0;
  while (!netIsOpen() && tries < 20) {
    await expect(fetchToDocuments(`https://x/${tries}.gif`, `${tries}.gif`)).resolves.toBeNull();
    tries++;
  }
  expect(netIsOpen()).toBe(true);
  await expect(fetchToDocuments('https://x/next.gif', 'next.gif')).resolves.toBeNull();
  expect(downloads).toHaveLength(tries);
});
