/**
 * Grab a remote image into the app's Documents; returns the saved filename,
 * or null when it could not be had.
 *
 * STREAMED TO DISK, NEVER HELD IN MEMORY (21 Oct 2026). This used to be
 * `fetch(url)` then `res.arrayBuffer()`. On Android, Expo's fetch queues the
 * whole body in a `ResponseSink` and then copies it into one direct buffer
 * (`ResponseSink.finalize`, ResponseSink.kt:21), and JS then hands that copy
 * back to native to write it. Six GIFs at a time, each one several MB, for a
 * member whose 296 archive pictures had just been approved: every launch ran
 * the background fill and died with `OutOfMemoryError` in that exact frame.
 * `File.downloadFileAsync` pipes the socket into the file natively, so the
 * size of a picture no longer reaches the JS heap or the direct-buffer pool.
 *
 * Hard timeout (15s): a dead-but-hanging CDN link must never stall an import;
 * the abort cancels the native transfer too, not just our wait for it.
 */
import { File, Paths } from 'expo-file-system';

import { netIsOpen, netReachable, netUnreachable } from '@/net-circuit';

export async function fetchToDocuments(url: string, name: string, timeoutMs = 15000): Promise<string | null> {
  // The breaker: a library with hundreds of comment images on a dead network
  // must not spend its timeout budget discovering that hundreds of times.
  if (netIsOpen()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const dest = new File(Paths.document, name);
  try {
    await File.downloadFileAsync(url, dest, { idempotent: true, signal: ctrl.signal });
    netReachable();
    return name;
  } catch (err) {
    // A non-2xx rejects with "response has status: 404" -- a CDN answering.
    // Anything else is the transport (timeout, no host, reset): the native
    // module wraps the IOException, so there is no TypeError to look for.
    if (err instanceof Error && /status/i.test(err.message)) netReachable();
    else netUnreachable();
    // Android streams straight into the destination, so a failed transfer can
    // leave half a picture behind; a half GIF is worse than the placeholder.
    try {
      if (dest.exists) dest.delete();
    } catch {
      // nothing to clean, or nothing we can do about it
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
