/**
 * The reads behind "Everything I watch": the page's rows and the profile
 * block's totals. The rules live in `everything-view.ts`, where they can be
 * tested; this file only turns the library into its input.
 *
 * THE SAME READS AS THE TWO PAGES IT JOINS. `getShowProgress` is what the Shows
 * page lists and `getMovies` is what the Films page lists — the films narrowed
 * to the WATCHED ones (`watchedFilms`), because a watchlist is not something
 * you watch. Nothing is counted here that the user could not find there too.
 */
import db, { getMovies, getShowProgress, type MovieRow, type ShowProgress } from '@/db';
import { movieFacts, showFacts } from '@/filter-facts';
import { lastWatchedKey, type TitleFacts } from '@/pure';
import { showMeta } from '@/metadata';
import { sortableDate, watchedFilms, type EverythingItem } from '@/everything-view';

/** A row, plus the show's progress so its poster can carry the same bar the
 *  Shows page draws, and the source row the filter facts are built from. */
export type LibraryItem = EverythingItem & { show?: ShowProgress; movie?: MovieRow };

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
  const movies: LibraryItem[] = watchedFilms(getMovies()).map((m) => ({
    kind: 'movie',
    key: `m:${m.name}`,
    name: m.title,
    search: `${m.title}\n${m.name}`.toLowerCase(),
    poster: m.poster,
    last: lastWatchedKey(m),
    // The Films page's own "last added": in-app adds, else when it was watched.
    added: sortableDate(m.addedAt ?? m.watchedAt),
    anime: false,
    movie: m,
  }));
  return [...shows, ...movies];
}

/**
 * The filter sheet's facts for these rows, in the same order — the Shows and
 * Films builders as they are, plus the Type axis. So every axis means on this
 * page exactly what it means on the page the title comes from.
 */
export function everythingFacts(items: readonly LibraryItem[]): TitleFacts[] {
  const shows = items.filter((it) => it.show);
  const films = items.filter((it) => it.movie);
  const sf = showFacts(shows.map((it) => it.show!));
  const mf = movieFacts(films.map((it) => it.movie!));
  const byKey = new Map<string, TitleFacts>();
  shows.forEach((it, i) => byKey.set(it.key, { ...sf[i], key: it.key, types: it.anime ? ['show', 'anime'] : ['show'] }));
  films.forEach((it, i) => byKey.set(it.key, { ...mf[i], key: it.key, types: ['movie'] }));
  return items.map((it) => byKey.get(it.key)!);
}

/**
 * Two totals and the most recently watched posters, shows and films mixed.
 * The profile block it was written for became a shelf (27 Oct), which reads
 * the Profile tab's own rows; the widget gallery's samples still borrow the
 * posters from here.
 *
 * NOT `everythingItems()`. That walks every show's metadata for the anime
 * flag — two counts and four posters are three small queries.
 */
export function everythingSummary(posters = 4): { shows: number; movies: number; posters: { key: string; name: string; uri: string }[] } {
  const n = (sql: string) => db.getFirstSync<{ n: number }>(sql)?.n ?? 0;
  const rows = db.getAllSync<{ key: string; name: string; uri: string }>(
    `SELECT key, name, uri FROM (
       SELECT 's:' || s.tvdbId AS key, s.name AS name, s.posterUrl AS uri,
              (SELECT MAX(watchedAt) FROM watches WHERE showId = s.tvdbId) AS last
         FROM shows s
       UNION ALL
       SELECT 'm:' || name, name, poster, watchedAt FROM movies WHERE watchedAt IS NOT NULL
     ) WHERE uri IS NOT NULL AND uri <> '' AND last IS NOT NULL
     ORDER BY REPLACE(last, ' ', 'T') DESC LIMIT ?`,
    [posters],
  );
  return { shows: n('SELECT COUNT(*) AS n FROM shows'), movies: n('SELECT COUNT(*) AS n FROM movies WHERE watchedAt IS NOT NULL'), posters: rows };
}
