/**
 * The reads behind "Everything I watch": the page's rows and the profile
 * block's totals. The rules live in `everything-view.ts`, where they can be
 * tested; this file only turns the library into its input.
 *
 * THE SAME READS AS THE TWO PAGES IT JOINS. `getShowProgress` is what the Shows
 * page lists and `getMovies` is what the Films page lists, so a title is on
 * this page exactly when it is on one of those — nothing is counted here that
 * the user could not find there too.
 */
import db, { getMovies, getShowProgress, type ShowProgress } from '@/db';
import { lastWatchedKey } from '@/pure';
import { showMeta } from '@/metadata';
import { sortableDate, type EverythingItem } from '@/everything-view';

/** A row, plus the show's progress so its poster can carry the same bar the
 *  Shows page draws. */
export type LibraryItem = EverythingItem & { show?: ShowProgress };

export function everythingItems(): LibraryItem[] {
  const shows: LibraryItem[] = getShowProgress().map((sp) => ({
    kind: 'show',
    key: `s:${sp.tvdbId}`,
    name: sp.name,
    search: sp.name.toLowerCase(),
    poster: sp.posterUrl,
    last: sortableDate(sp.lastWatchedAt),
    added: sortableDate(sp.addedAt),
    // One metadata lookup per show, as the Shows page's filters already pay;
    // `showMeta` caches, so a second visit is map lookups.
    anime: showMeta(sp.tvdbId)?.genres?.includes('Anime') ?? false,
    show: sp,
  }));
  const movies: LibraryItem[] = getMovies().map((m) => ({
    kind: 'movie',
    key: `m:${m.name}`,
    name: m.title,
    search: `${m.title}\n${m.name}`.toLowerCase(),
    poster: m.poster,
    last: lastWatchedKey(m),
    // The Films page's own "last added": in-app adds, else when it was watched.
    added: sortableDate(m.addedAt ?? m.watchedAt),
    anime: false,
  }));
  return [...shows, ...movies];
}

/**
 * What the profile block shows: two totals and the most recently watched
 * posters, shows and films mixed.
 *
 * NOT `everythingItems()`. That walks every show's metadata for the anime
 * flag, and the block is drawn on every visit to the Profile tab — two counts
 * and four posters are three small queries.
 */
export function everythingSummary(posters = 4): { shows: number; movies: number; posters: { key: string; name: string; uri: string }[] } {
  const n = (sql: string) => db.getFirstSync<{ n: number }>(sql)?.n ?? 0;
  const rows = db.getAllSync<{ key: string; name: string; uri: string }>(
    `SELECT key, name, uri FROM (
       SELECT 's:' || s.tvdbId AS key, s.name AS name, s.posterUrl AS uri,
              (SELECT MAX(watchedAt) FROM watches WHERE showId = s.tvdbId) AS last
         FROM shows s
       UNION ALL
       SELECT 'm:' || name, name, poster, watchedAt FROM movies
     ) WHERE uri IS NOT NULL AND uri <> '' AND last IS NOT NULL
     ORDER BY REPLACE(last, ' ', 'T') DESC LIMIT ?`,
    [posters],
  );
  return { shows: n('SELECT COUNT(*) AS n FROM shows'), movies: n('SELECT COUNT(*) AS n FROM movies'), posters: rows };
}
