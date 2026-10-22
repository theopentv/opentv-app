/**
 * The two decisions behind a cached, progressively-drawn feed, kept free of the
 * database and the network so they can be tested on their own.
 *
 * WHY A CACHE AT ALL (22 Oct): Explore → FEED built itself from scratch on
 * every launch — one `/trending` call and then one ~50 KB `/extended` record
 * per card, ~0.7 s each, 36 of them through a pool of five — and drew nothing
 * until the last one landed. Five or six seconds of spinner for a list that
 * TheTVDB itself only recomputes weekly.
 */
import { localDayStamp } from '@/pure';

export type DayCache<T> = {
  /** `YYYY-MM-DD`, local — the cache is only ever good for the day it was built */
  day: string;
  /** ms epoch of the build, for the background refresh */
  at: number;
  /** what the content depended on (app language, plot languages) */
  key: string;
  items: T[];
};

/**
 * `miss` — nothing usable: build it, and the screen waits.
 * `fresh` — show it, ask nothing.
 * `stale` — show it now, rebuild quietly for next time.
 *
 * A cache from yesterday is a miss rather than stale, on purpose: "today's
 * feed" is what the owner asked for, and a day-old trending list served
 * without a word is the kind of thing nobody notices is wrong until it is.
 */
export function dayCacheState<T>(
  entry: DayCache<T> | null,
  now: Date,
  key: string,
  refreshMs: number,
): 'miss' | 'fresh' | 'stale' {
  if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return 'miss';
  if (entry.key !== key || entry.day !== localDayStamp(now)) return 'miss';
  // a clock moved backwards is not evidence of freshness
  const age = now.getTime() - entry.at;
  return age >= 0 && age < refreshMs ? 'fresh' : 'stale';
}

export function parseDayCache<T>(raw: string | null): DayCache<T> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as DayCache<T>;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/**
 * What can be drawn yet, IN FEED ORDER.
 *
 * Requests finish in any order; cards must not. So only the settled prefix
 * counts: a fast card #7 waits for a slow #3, otherwise the list would reshuffle
 * under somebody's thumb as the stragglers arrive. Unusable rows (no art, or
 * already in the library) are skipped, and the result never exceeds `limit`.
 */
export function readyPrefix<T>(results: readonly (T | null)[], settled: readonly boolean[], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < results.length && out.length < limit; i++) {
    if (!settled[i]) break;
    const r = results[i];
    if (r != null) out.push(r);
  }
  return out;
}
