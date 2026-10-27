/**
 * "Everything I watch" (2.0.3): shows, anime and films on one page, as pure
 * filtering and sorting so the rules can be tested without a database.
 *
 * WHY ONE LIST AND NOT TWO SECTIONS. The question that started it (the Arabic
 * channel admin, 26 Oct: "is there no way to see all the films, series and
 * anime I follow?") is about the whole library at once. Shows and Films each
 * already have a page; a third page that is the same two grids stacked would
 * answer nothing. So the rows are mixed and the chips split them back out.
 */
import { compareTitles } from '@/pure';

export type EverythingKind = 'all' | 'shows' | 'anime' | 'movies';
export type EverythingSort = 'recent' | 'alpha' | 'added';

export type EverythingItem = {
  kind: 'show' | 'movie';
  /** Unique across both kinds: a show and a film may share a name. */
  key: string;
  /** What the poster's name card and the screen reader say. */
  name: string;
  /** Lower-cased text the search box matches: the shown name and, for a
   *  film, its stored name too (see all-movies: type what you can see, or the
   *  original). */
  search: string;
  poster: string | null;
  /** Latest watch, ISO-ish, '' when never. */
  last: string;
  /** When it was added in the app, '' for an import. */
  added: string;
  /**
   * TheTVDB's own "Anime" genre on the show's metadata — a field the source
   * curates, never a guess from a title, a language or a network. A show whose
   * metadata has not arrived yet is simply a show until it does.
   */
  anime: boolean;
};

/** "2026-10-27 21:04:00" and "2026-10-27T21:04:00Z" sort together. */
export const sortableDate = (v: string | null | undefined): string => (v ? v.replace(' ', 'T') : '');

export function everythingView<T extends EverythingItem>(
  items: readonly T[],
  kind: EverythingKind,
  sort: EverythingSort,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  const out = items.filter(
    (it) =>
      (kind === 'all' ||
        (kind === 'shows' && it.kind === 'show') ||
        (kind === 'anime' && it.kind === 'show' && it.anime) ||
        (kind === 'movies' && it.kind === 'movie')) &&
      (!q || it.search.includes(q)),
  );
  // The same three orders the Shows and Films pages offer, with the same
  // tie-break: A-Z, so an import's undated rows still come out in an order.
  if (sort === 'alpha') out.sort((a, b) => compareTitles(a.name, b.name));
  else if (sort === 'added') out.sort((a, b) => b.added.localeCompare(a.added) || compareTitles(a.name, b.name));
  else out.sort((a, b) => b.last.localeCompare(a.last) || compareTitles(a.name, b.name));
  return out;
}

/** Totals for the chips and the profile block. */
export function everythingCounts(items: readonly EverythingItem[]): { shows: number; anime: number; movies: number } {
  let shows = 0;
  let anime = 0;
  let movies = 0;
  for (const it of items) {
    if (it.kind === 'movie') movies += 1;
    else {
      shows += 1;
      if (it.anime) anime += 1;
    }
  }
  return { shows, anime, movies };
}
