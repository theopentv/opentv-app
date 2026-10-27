/**
 * Bringing a library over from a tracker that is still alive.
 *
 * WHY THIS EXISTS, and it is not the same reason as the TV Time importer. That
 * one reaches people whose app DIED, which is a finite pool that empties. These
 * reach people whose app is alive and annoying them — millions of them, right
 * now, asking about alternatives in their own communities every week. The
 * bottleneck on this project has never been features; it is that not enough
 * people have heard of it.
 *
 * NOTHING HERE TOUCHES THE DATABASE. Each function maps a foreign export into
 * the three row shapes `importer.ts` already speaks — the GDPR shapes — and the
 * whole merge-safe, self-repairing, idempotent pipeline behind them runs
 * unchanged. That is deliberate and it is the entire design: a second source
 * must not be a second importer, or "re-importing is always safe" becomes a
 * promise that holds for one of them.
 *
 * The same trick the third-party TV Time browser extension already gets — see
 * the `communityCsv` fallback in `importer.ts` — generalised to sources that
 * were never TV Time at all.
 *
 * PURE, so every mapping is tested under plain Node against real export
 * headers rather than discovered on a user's phone.
 */

import { EMOTION_NAMES } from '@/pure';
import { ratingFromStars, ratingFromTen } from '@/star-rating';

/** The GDPR-shaped rows the importer consumes. Strings throughout, as CSV. */
export type ForeignRows = {
  /** `user_tv_show_data.csv` shape — one per tracked show. */
  showRows: Record<string, string>[];
  /** `tracking-prod-records-v2.csv` shape — one per episode watch. */
  episodeRows: Record<string, string>[];
  /** `tracking-prod-records.csv` shape — watches, rewatches and watchlist. */
  movieRows: Record<string, string>[];
  /** Film ratings OUT OF TEN, the scale `movies.stars` holds since 2.0.0 —
   *  so a Letterboxd 3.5 arrives as 7 and a Trakt 7 stays 7. */
  movieRatings: { name: string; ten: number }[];
  /**
   * Episode scores OUT OF TEN, the scale `episode_ratings.stars` holds since
   * 2.0.0, keyed by show NAME because that is how the GDPR votes file arrives
   * and how the importer places them. Only Serializd rates episodes at all;
   * the other sources leave this out.
   */
  episodeRatings?: { name: string; season: number; episode: number; ten: number }[];
  /** Reviews as rows of the comments table: `entity` is "Show" or "Show S1E2". Serializd only. */
  comments?: { entity: string; text: string; date: string }[];
  /** Private notes (Simkl's memos), never published: a show's whole-show note
   *  is season -1 / episode -1, the same key the notes screen writes. */
  notes?: { shows: { showId: number; season: number; episode: number; text: string }[]; movies: { movie: string; text: string }[] };
  /** A film's TMDB id where the file names it (Simkl), so the importer asks
   *  for that film instead of searching its title: Simkl names anime films in
   *  romaji ("Sen to Chihiro no Kamikakushi"), which no title search finds. */
  movieTmdb?: { name: string; tmdbId: number }[];
  /** Episode emotions as the app's own index, `EMOTION_NAMES` order, keyed by
   *  show NAME like the ratings. Bingers only. */
  episodeEmotions?: { name: string; season: number; episode: number; emotion: number }[];
  /** A film's emotions as the `emotions` table holds them: that index + 28. */
  movieEmotions?: { name: string; value: number }[];
  /** "Who was your favourite?" by the character's NAME (Bingers). One per
   *  episode and one per film, because that is all the app's tables hold. */
  episodeCharacters?: { name: string; season: number; episode: number; character: string }[];
  movieCharacters?: { movie: string; character: string }[];
  /** Rows in the shape of TV Time's `lists-prod-lists.csv` — custom lists and
   *  the two favourites rows — so the importer's own list code places them. */
  listRows?: Record<string, string>[];
};

export const NO_ROWS: ForeignRows = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [] };

/** A day, as the importer's `created_at` wants it. Letterboxd gives 'YYYY-MM-DD'. */
function stamp(day: string | undefined): string {
  const d = (day ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d} 12:00:00` : d;
}

/**
 * LETTERBOXD — a plain CSV export, and the cheapest of the three by a distance:
 * no OAuth, no API key, no rate limit, no application to register. The user
 * downloads a ZIP from their settings and hands it over.
 *
 * FILMS ONLY, which is the honest limit and has to be said out loud before
 * somebody imports and finds half an app. Letterboxd does not track television,
 * so a person arriving this way brings their films and none of their shows.
 *
 * FOUR FILES, and `diary.csv` is the valuable one: `watched.csv` knows only
 * THAT you saw something, while the diary knows WHEN — including rewatches as
 * separate dated entries. A tracker whose whole argument is that it remembers
 * the day should prefer the file with the days in it.
 */
export function letterboxdRows(files: Record<string, Record<string, string>[]>): ForeignRows {
  const rows: ForeignRows = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [] };

  /*
   * ALREADY PARSED BY `parseCsv`, deliberately. A second CSV parser here would
   * be a second thing to get quoting wrong, and film titles are full of commas
   * — "The Good, the Bad and the Ugly" splits into three columns under any
   * parser that merely cuts on commas. Headers are lowercased because
   * Letterboxd writes "Watched Date" and this reads it as one key.
   */
  const table = (name: string): Record<string, string>[] => {
    const key = Object.keys(files).find((k) => k.toLowerCase().endsWith(`${name}.csv`));
    if (!key) return [];
    return files[key].map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), (v ?? '').trim()])),
    );
  };

  /*
   * THE DIARY FIRST, THEN WATCHED for anything the diary never mentioned.
   *
   * Somebody who logged films for years has both: the diary carries the dates
   * and the rewatches, and `watched.csv` carries everything they ever ticked
   * including the ones they added before they kept a diary. Taking the diary
   * first means a film seen three times arrives with three dates rather than
   * one, and taking watched.csv afterwards means nothing is dropped.
   */
  const seen = new Set<string>();
  const keyOf = (name: string, year: string) => `${name.toLowerCase()}|${year}`;

  for (const r of table('diary')) {
    const name = r.name;
    if (!name) continue;
    // ONLY A FIRST WATCH COUNTS AS SEEN (8 Oct). A film whose diary holds
    // nothing but a rewatch was marked seen here, so its watched.csv row was
    // skipped — and a rewatch with no watch under it imported as nothing: the
    // film was simply missing from the library.
    if (r.rewatch !== 'Yes') seen.add(keyOf(name, r.year ?? ''));
    rows.movieRows.push({
      // A REWATCH IS ITS OWN ROW TYPE, exactly as the GDPR export models it, so
      // the film keeps one watch and a rewatch count rather than appearing
      // three times in the library.
      type: r.rewatch === 'Yes' ? 'rewatch' : 'watch',
      entity_type: 'movie',
      movie_name: name,
      movie_year: r.year ?? '',
      // 'Watched Date' is when they say they saw it; 'Date' is when they logged
      // it. The first is the truth the archive is for.
      created_at: stamp(r['watched date'] || r.date),
    });
  }

  for (const r of table('watched')) {
    const name = r.name;
    if (!name || seen.has(keyOf(name, r.year ?? ''))) continue;
    seen.add(keyOf(name, r.year ?? ''));
    rows.movieRows.push({
      type: 'watch',
      entity_type: 'movie',
      movie_name: name,
      movie_year: r.year ?? '',
      created_at: stamp(r.date),
    });
  }

  for (const r of table('watchlist')) {
    if (!r.name) continue;
    rows.movieRows.push({
      type: 'towatch',
      entity_type: 'movie',
      movie_name: r.name,
      movie_year: r.year ?? '',
      created_at: stamp(r.date),
    });
  }

  /*
   * HALF STARS ARRIVE AS HALF STARS (2.0.0). Letterboxd runs 0.5–5 and films
   * here are now out of ten, so 3.5 is 7 exactly. Until 2.0.0 the half had to
   * go somewhere and went up, which made 3.5 and 4 the same film.
   */
  for (const r of table('ratings')) {
    const ten = ratingFromStars(Number(r.rating));
    if (!r.name || ten == null) continue;
    rows.movieRatings.push({ name: r.name, ten });
  }

  return rows;
}

/**
 * IMDB — asked for on r/moviecritic, 25 Sep 2026, and the cheapest door of the
 * lot: one CSV, no ZIP, no OAuth, no key. Ratings live at
 * imdb.com/list/ratings behind an Export button; the Watchlist and any custom
 * list export the same way.
 *
 * TELEVISION TOO, since 1.7.1 (14 Oct 2026). Until then this read films only,
 * and a support email said exactly what that looks like from outside: "the
 * file contains both movies and TV series, but only the movies appeared". The
 * reason it was skipped still holds -- IMDb's export carries no series column
 * and no season or episode number, and a rated episode is a row whose Title is
 * the EPISODE's own name -- so nothing in the FILE can place a television
 * watch. The `Const` can: TheTVDB indexes IMDb ids for series AND for single
 * episodes, so `tt0959621` answers "episode 349232 of series 81189", and that
 * episode's own record carries the season and number. That needs the network,
 * which nothing in this file touches, so it is the Serializd shape again: this
 * function sets the television rows aside as `imdbTv`, the importer resolves
 * their ids, and `imdbTvRows` maps them through that answer.
 *
 * A SERIES ROW IS A FOLLOW, NOTHING MORE. Rating a show on IMDb says you have
 * an opinion of it, not which episodes you saw, and inventing a season of
 * watches for it would be the one thing worse than skipping it.
 *
 * A RATING IS THE ONLY EVIDENCE OF A WATCH. IMDb has no watch history: it
 * knows what you scored and when you scored it, so an import has to decide
 * that a rated film is a watched film. True of nearly everybody, not true of
 * everybody -- somebody who rates trailers or rates from memory gets a watch
 * they did not have. The alternative is importing ratings with no watches,
 * which leaves a library of films the app thinks you have never seen, and that
 * is wrong for far more people.
 *
 * WHICH DATE. `Date Rated` for a rating, `Created` for a watchlist row --
 * neither is the day they actually watched it, and IMDb does not hold that
 * day. It is the closest true thing in the file, and it is better than today.
 *
 * TWO HEADER GENERATIONS, both read: IMDb changed the columns at the end of
 * 2017 (`You rated` -> `Your Rating`, `Title type` -> `Title Type`, and the
 * old `position`/`created`/`modified` block). Exports from before then are
 * still sitting in people's downloads folders.
 */
const IMDB_FILM_TYPES = new Set([
  'movie',
  'tvmovie',
  'tv movie',
  'video',
  'short',
  'tvshort',
  'tv short',
  'tvspecial',
  'tv special',
  'documentary',
]);

/*
 * Television, in both spellings: `tvSeries` / `tvMiniSeries` / `tvEpisode`
 * since 2017, and "TV Series" / "Mini-Series" / "TV Episode" before. Read with
 * spaces and hyphens squeezed out so one set answers for both generations.
 */
const IMDB_SERIES_TYPES = new Set(['tvseries', 'tvminiseries', 'miniseries']);
const IMDB_EPISODE_TYPES = new Set(['tvepisode', 'episode']);
const squeeze = (v: string): string => v.toLowerCase().replace(/[\s-]/g, '');

/** One television row of an IMDb export, waiting for TheTVDB to place it. */
export type ImdbTvRef = {
  /** `Const`, e.g. "tt0959621". */
  imdbId: string;
  /** The row's own Title: the SHOW's name for a series, the EPISODE's for an episode. */
  title: string;
  kind: 'series' | 'episode';
  /** `Date Rated` (or `Created`), as `created_at` wants it; '' when undated. */
  at: string;
  ten: number | null;
};

/** A day as `created_at` wants it, from the handful of shapes IMDb has used. */
function imdbDay(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return `${v.slice(0, 10)} 12:00:00`;
  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  // '24 Sep 2026' / 'Sep 24, 2026' — the pre-2018 exports and some locales.
  const named = /^(?:(\d{1,2})\s+)?([a-z]{3})[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/i.exec(v);
  if (named) {
    const m = months.indexOf(named[2].toLowerCase());
    const day = named[1] ?? named[3];
    if (m >= 0 && day) {
      return `${named[4]}-${String(m + 1).padStart(2, '0')}-${day.padStart(2, '0')} 12:00:00`;
    }
  }
  // 'M/D/YYYY', IMDb's old "Release Date (month/day/year)".
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')} 12:00:00`;
  }
  /* UNDATED RATHER THAN WRONGLY DATED. A date nobody can parse must not become
     today's: the whole point of the archive is the day, and inventing one is
     worse than admitting there isn't one. */
  return '';
}

/**
 * THE LETTERBOXD *IMPORT* SHAPE, which is not the shape `letterboxdRows`
 * reads — and the distinction is the whole reason this exists.
 *
 * Letterboxd's EXPORT is four files (`diary.csv`, `watched.csv`,
 * `ratings.csv`, `watchlist.csv`) with the columns `Name`, `Date`, `Watched
 * Date`, `Rewatch`. Letterboxd's IMPORT is ONE file with `Title`, `Year`,
 * `Rating`, `WatchedDate`, `imdbID`, `tmdbID`. Same company, different
 * vocabulary; reading one with the other's keys yields a file of blank names
 * and an import that reports zero.
 *
 * WHY THE IMPORT SHAPE MATTERS MORE. It is the interchange format the whole
 * ecosystem writes: it is what the JustWatch browser extension produces —
 * JustWatch has no export of its own, which is the finding that killed the
 * idea of a JustWatch parser — and what a dozen other "get your list out of X"
 * tools produce, because Letterboxd is where people were taking their lists.
 * Supporting one documented format reaches all of them.
 *
 * FILMS ONLY, like everything that comes through Letterboxd's shape.
 */
const LBX_MARKERS = ['watcheddate', 'letterboxduri', 'letterboxd uri', 'rating10', 'imdbid', 'tmdbid'];

/** One row per film, so it is detected on its columns like the IMDb one. */
export function isLetterboxdImportCsv(header: readonly string[]): boolean {
  const keys = new Set(header.map((h) => h.trim().toLowerCase()));
  // `Const` is IMDb's, and an IMDb export also carries a `Title`. Whichever
  // detector runs first must not answer for the other's file.
  if (keys.has('const')) return false;
  if (!keys.has('title')) return false;
  return LBX_MARKERS.some((m) => keys.has(m));
}

export function letterboxdImportRows(table: readonly Record<string, string>[]): ForeignRows {
  const rows: ForeignRows = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [] };

  for (const raw of table) {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = (v ?? '').trim();

    const name = r.title;
    if (!name) continue;
    const year = r.year ?? '';
    const watched = r.watcheddate || r['watched date'];

    /* RATING10 FIRST. A file that carries both is giving the same opinion at
       two resolutions, and ten points survives the trip better: 3.5 stars is
       7, and reading the 3.5 means deciding where the half goes all over
       again. */
    const ten = ratingFromTen(Number(r.rating10)) ?? ratingFromStars(Number(r.rating));

    /*
     * A DATE OR A SCORE MEANS WATCHED; NEITHER MEANS WATCHLIST.
     *
     * This format carries no "seen" flag, so the evidence is what is in the
     * row. A watchlist export from any of these tools is titles and years and
     * nothing else, which is exactly the row that falls through to `towatch`.
     */
    if (watched || ten != null) {
      rows.movieRows.push({
        type: 'watch',
        entity_type: 'movie',
        movie_name: name,
        movie_year: year,
        created_at: imdbDay(watched),
      });
      if (ten != null) rows.movieRatings.push({ name, ten });
      continue;
    }

    rows.movieRows.push({
      type: 'towatch',
      entity_type: 'movie',
      movie_name: name,
      movie_year: year,
      created_at: '',
    });
  }

  return rows;
}

/**
 * The 32 characters where windows-1252 and Latin-1 disagree. Everything else
 * in cp1252 is its Latin-1 self, which is its byte value as a code point.
 */
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/**
 * Bytes as windows-1252 text.
 *
 * IMDb has written these exports in cp1252 since 2018, and RN's `TextDecoder`
 * is not guaranteed to know that label, so the table is here rather than
 * borrowed. Thirty-two entries is the whole difference.
 */
export function cp1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b);
  }
  return out;
}

/** Is this parsed CSV an IMDb export? The header row is the only signature a
 *  bare `.csv` has, and it is the one thing nobody edits. */
export function isImdbCsv(header: readonly string[]): boolean {
  const keys = new Set(header.map((h) => h.trim().toLowerCase()));
  return keys.has('const') && (keys.has('title type') || keys.has('title_type'));
}

export function imdbRows(table: readonly Record<string, string>[]): ForeignRows & { imdbTv: ImdbTvRef[] } {
  const rows: ForeignRows & { imdbTv: ImdbTvRef[] } = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [], imdbTv: [] };

  for (const raw of table) {
    // Lowercased once per row so both header generations read as one shape.
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = (v ?? '').trim();

    const name = r.title || r['original title'];
    if (!name) continue;
    const type = (r['title type'] || r['title_type'] || '').toLowerCase();
    const tv = IMDB_SERIES_TYPES.has(squeeze(type)) ? 'series' : IMDB_EPISODE_TYPES.has(squeeze(type)) ? 'episode' : null;
    if (tv) {
      rows.imdbTv.push({
        imdbId: r.const ?? '',
        title: name,
        kind: tv,
        at: imdbDay(r['date rated'] || r.created),
        ten: ratingFromTen(Number(r['your rating'] || r['you rated'])),
      });
      continue;
    }
    if (!IMDB_FILM_TYPES.has(type)) continue;

    const year = r.year ?? '';
    const score = Number(r['your rating'] || r['you rated']);
    // Out of ten, kept out of ten: a 7 and an 8 are two different films.
    const ten = ratingFromTen(score);

    if (ten == null) {
      /* No score: a watchlist or a list row. `Created` is when it went on the
         list, which is the only date that file has. */
      rows.movieRows.push({
        type: 'towatch',
        entity_type: 'movie',
        movie_name: name,
        movie_year: year,
        created_at: imdbDay(r.created || r.modified),
      });
      continue;
    }

    rows.movieRows.push({
      type: 'watch',
      entity_type: 'movie',
      movie_name: name,
      movie_year: year,
      created_at: imdbDay(r['date rated'] || r.created),
    });
    rows.movieRatings.push({ name, ten });
  }

  return rows;
}

/**
 * What TheTVDB said about one IMDb id. `none` is an answer (it has no such
 * record); `failed` is not (offline, or it would not say), and the difference
 * is what the not-imported list tells the reader to do about it.
 */
export type ImdbTvHit =
  | { kind: 'series'; tvdbId: number; name: string }
  | { kind: 'episode'; tvdbId: number; name: string; season: number; episode: number; episodeId: number }
  | 'none'
  | 'failed';

/**
 * The useful part of a `/search/remoteid/{tt…}` reply. Same rule as
 * `tvdbSeriesByImdbId`: read only the record types asked about, because the
 * reply mixes types. An EPISODE's entry carries its id and `seriesId` but --
 * checked against the live API on 14 Oct 2026 with the Breaking Bad pilot --
 * a null season and number, so the caller asks `/episodes/{id}` for those.
 */
export function imdbRemoteHit(
  data: unknown,
): { kind: 'series'; tvdbId: number; name: string } | { kind: 'episode'; episodeId: number; seriesId: number } | null {
  if (!Array.isArray(data)) return null;
  for (const r of data) {
    if (!isObject(r)) continue;
    const series = r.series;
    if (isObject(series) && Number(series.id) > 0) {
      return { kind: 'series', tvdbId: Number(series.id), name: strOf(series.name) };
    }
    const ep = r.episode;
    if (isObject(ep) && Number(ep.id) > 0 && Number(ep.seriesId) > 0) {
      return { kind: 'episode', episodeId: Number(ep.id), seriesId: Number(ep.seriesId) };
    }
  }
  return null;
}

/**
 * IMDb's television rows, placed. A series becomes a followed show; an episode
 * becomes its show (followed, if the file did not already bring it) plus one
 * watch dated like a film's, and its score on the app's whole-star scale --
 * out of ten, like IMDb films since 2.0.0. An
 * episode row with no score is a list entry, not a watch, so it brings only
 * its show, the way an unrated film goes to the watchlist rather than the
 * library.
 *
 * DEDUPED HERE, because a ratings export and a watchlist export of the same
 * account repeat rows, and the importer is merge-safe against the library but
 * not against a file that says the same thing twice. Every row the link could
 * not place comes back in `misses` with a reason -- never silently dropped.
 */
export function imdbTvRows(
  refs: readonly ImdbTvRef[],
  link: ReadonlyMap<string, ImdbTvHit>,
): { rows: ForeignRows; misses: { kind: 'show' | 'episodes'; name: string; reason: string }[] } {
  const shows = new Map<number, string>();
  const episodeRows: Record<string, string>[] = [];
  const episodeRatings: NonNullable<ForeignRows['episodeRatings']> = [];
  const misses: { kind: 'show' | 'episodes'; name: string; reason: string }[] = [];
  const seenEp = new Set<string>();
  const seenMiss = new Set<string>();

  // Series rows first, so a show is named by its own row when the file has one.
  const ordered = [...refs].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'series' ? -1 : 1));
  for (const ref of ordered) {
    const hit = link.get(ref.imdbId) ?? 'none';
    if (hit === 'none' || hit === 'failed') {
      if (seenMiss.has(ref.imdbId)) continue;
      seenMiss.add(ref.imdbId);
      misses.push({
        kind: ref.kind === 'series' ? 'show' : 'episodes',
        name: ref.title,
        reason:
          hit === 'failed'
            ? 'TheTVDB could not be reached — import the file again online; nothing already imported is added twice'
            : ref.kind === 'series'
              ? 'TheTVDB has no show with this IMDb id — add it from Search'
              : 'TheTVDB has no episode with this IMDb id — mark it watched from its show',
      });
      continue;
    }
    if (!shows.has(hit.tvdbId)) shows.set(hit.tvdbId, hit.name);
    if (hit.kind !== 'episode' || ref.ten == null) continue;
    const key = `${hit.tvdbId}-${hit.season}-${hit.episode}`;
    if (seenEp.has(key)) continue;
    seenEp.add(key);
    const name = shows.get(hit.tvdbId) || hit.name;
    episodeRows.push({
      s_id: String(hit.tvdbId),
      season_number: String(hit.season),
      episode_number: String(hit.episode),
      episode_id: String(hit.episodeId),
      created_at: ref.at,
      series_name: name,
    });
    // Keyed by name downstream, exactly like the GDPR votes file.
    if (name) episodeRatings.push({ name, season: hit.season, episode: hit.episode, ten: ref.ten });
  }

  const showRows = [...shows].map(([tvdbId, name]) => ({
    tv_show_id: String(tvdbId),
    tv_show_name: name,
    is_followed: '1',
    is_favorited: '0',
    archived: '0',
  }));
  return { rows: { showRows, episodeRows, movieRows: [], movieRatings: [], episodeRatings }, misses };
}

/** What a foreign export turned out to be, for the screen that reports it. */
export type ForeignSource = 'letterboxd' | 'simkl' | 'trakt' | 'serializd';

/**
 * Which service a ZIP came from, by the files inside it.
 *
 * BY CONTENT, NEVER BY FILE NAME. People rename downloads, and a ZIP called
 * "letterboxd.zip" that holds a TV Time export must import as TV Time. The
 * signature is the header row, which nobody edits.
 */
export function detectForeignSource(names: readonly string[]): ForeignSource | null {
  const lower = names.map((n) => (n.split('/').pop() ?? '').toLowerCase());
  if (lower.some((n) => n === 'diary.csv' || n === 'watched.csv') && lower.some((n) => n === 'ratings.csv')) {
    return 'letterboxd';
  }
  return null;
}

/**
 * Trakt and Simkl both export JSON, so their signature is a SHAPE rather than a
 * header row — but the rule is the same one, and for the same reason: a ZIP
 * called "trakt.zip" holding a Simkl backup must import as Simkl.
 *
 * A Simkl backup is ONE object with `shows`, `movies` or `anime` in it. A Trakt
 * export is SEVERAL arrays, one per file, and which array is which is knowable
 * from what its items carry — `watched_at` is a watch, `listed_at` is a
 * watchlist entry, `rated_at` is a rating. So a renamed file still lands in the
 * right pile, which is the whole point of not reading the name.
 */
export type ForeignJson =
  | { source: 'simkl'; json: unknown }
  | { source: 'trakt'; payload: TraktPayload }
  | { source: 'serializd'; records: SerializdRecord[] }
  | null;

export type TraktPayload = {
  history?: ForeignItem[];
  watchlist?: ForeignItem[];
  ratings?: ForeignItem[];
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Does this array look like Trakt/Simkl items rather than somebody else's JSON? */
function looksForeign(items: unknown[]): boolean {
  return items.some(
    (it) => isObject(it) && ('show' in it || 'movie' in it || 'episode' in it || 'ids' in it),
  );
}

export function classifyForeignJson(parsed: readonly unknown[]): ForeignJson {
  /*
   * SERIALIZD FIRST, by the records its walker recognises — `showId`,
   * `dateAdded`, `episodeNumber`, words neither Trakt nor Simkl ever write, so
   * their files yield nothing here and fall through. Ahead of Simkl because
   * Simkl is known by a top-level `shows` array, and a Serializd export that
   * wraps its records in one would otherwise be read as Simkl and import
   * nothing. Every JSON in the ZIP pools into one list: a context dump beside
   * an episode dump is one library.
   */
  const records = parsed.flatMap((j) => serializdRecords(j));
  if (records.length > 0) return { source: 'serializd', records };

  // Simkl next: one object that carries the lists by name.
  for (const j of parsed) {
    if (!isObject(j)) continue;
    const lists = ['shows', 'movies', 'anime'].filter((k) => Array.isArray(j[k]));
    if (lists.length > 0) return { source: 'simkl', json: j };
  }

  const payload: TraktPayload = {};
  for (const j of parsed) {
    if (!Array.isArray(j) || !looksForeign(j)) continue;
    const items = j as ForeignItem[];
    // Sorted by the field that is present, most specific first: a rating row
    // carries `rated_at`, a watchlist row `listed_at`, and a watch the date it
    // happened. Anything else is left alone rather than guessed at.
    if (items.some((it) => it?.rated_at != null || it?.rating != null)) {
      payload.ratings = [...(payload.ratings ?? []), ...items];
    } else if (items.some((it) => it?.listed_at != null)) {
      payload.watchlist = [...(payload.watchlist ?? []), ...items];
    } else if (items.some((it) => it?.watched_at != null || it?.last_watched_at != null)) {
      payload.history = [...(payload.history ?? []), ...items];
    }
  }
  return payload.history || payload.watchlist || payload.ratings ? { source: 'trakt', payload } : null;
}

/**
 * One item as Trakt and Simkl both describe it. They are near-identical by
 * design — Simkl copied Trakt's conventions — so one shape reads both, and the
 * fields nobody guarantees are all optional.
 */
type ForeignIds = { tvdb?: number | string; tmdb?: number | string; imdb?: string };
type ForeignTitle = { title?: string; year?: number | string; ids?: ForeignIds };
type ForeignItem = {
  watched_at?: string;
  last_watched_at?: string;
  listed_at?: string;
  rated_at?: string;
  rating?: number;
  user_rating?: number;
  type?: string;
  episode?: { season?: number; number?: number };
  show?: ForeignTitle;
  movie?: ForeignTitle;
} & ForeignTitle;

const idText = (v: number | string | undefined): string => (v == null ? '' : String(v));

/**
 * TRAKT and SIMKL, which are the same mapping because they are the same shape.
 *
 * SHOWS ARRIVE KEYED BY TheTVDB ID, which is what this app's `shows` table uses
 * as its primary key — so a show imported here lands on exactly the row a TV
 * Time import would have created, and somebody who has both does not end up
 * with two of everything. A show with no TheTVDB id is dropped rather than
 * matched by name: name matching is the bug that made search offer "ADD SHOW"
 * for shows already tracked, and it is not worth repeating on the way in.
 *
 * NOT IMPORTED, and it should be said rather than discovered: episode ratings
 * and show ratings. This app rates EPISODES and both services mostly rate
 * SHOWS, and spreading one show score across forty episodes would invent forty
 * opinions nobody expressed.
 */
export function traktRows(payload: {
  history?: readonly ForeignItem[];
  watchlist?: readonly ForeignItem[];
  ratings?: readonly ForeignItem[];
}): ForeignRows {
  const rows: ForeignRows = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [] };
  const shows = new Map<string, string>();

  for (const item of payload.history ?? []) {
    const at = item.watched_at ?? item.last_watched_at ?? '';
    const movie = item.movie ?? (item.type === 'movie' ? item : null);
    const show = item.show;

    if (item.episode && show) {
      const tvdb = idText(show.ids?.tvdb);
      if (!tvdb) continue;
      if (show.title) shows.set(tvdb, show.title);
      rows.episodeRows.push({
        s_id: tvdb,
        season_number: String(item.episode.season ?? ''),
        episode_number: String(item.episode.number ?? ''),
        created_at: at,
        series_name: show.title ?? '',
      });
      continue;
    }

    if (movie?.title) {
      rows.movieRows.push({
        type: 'watch',
        entity_type: 'movie',
        movie_name: movie.title,
        movie_year: idText(movie.year),
        created_at: at,
      });
    }
  }

  for (const item of payload.watchlist ?? []) {
    const movie = item.movie ?? (item.type === 'movie' ? item : null);
    if (!movie?.title) continue;
    rows.movieRows.push({
      type: 'towatch',
      entity_type: 'movie',
      movie_name: movie.title,
      movie_year: idText(movie.year),
      created_at: item.listed_at ?? '',
    });
  }

  for (const item of payload.ratings ?? []) {
    const movie = item.movie ?? (item.type === 'movie' ? item : null);
    const score = item.rating ?? item.user_rating;
    if (!movie?.title || score == null) continue;
    const ten = ratingFromTen(score);
    if (ten != null) rows.movieRatings.push({ name: movie.title, ten });
  }

  for (const [tvdbId, name] of shows) {
    rows.showRows.push({
      tv_show_id: tvdbId,
      tv_show_name: name,
      is_followed: '1',
      is_favorited: '0',
      archived: '0',
    });
  }

  return rows;
}

/**
 * SIMKL's file export, which nests episodes under seasons instead of listing
 * each watch — so it is flattened into the same rows before `traktRows` sees
 * the movies and ratings.
 *
 * A NESTED EPISODE HAS NO DATE OF ITS OWN in some exports, only the show's
 * `last_watched_at`. That is carried through rather than dropped, and it is
 * worth knowing what it means: a show watched over two years arrives with every
 * episode stamped on the last day. Wrong, but present — and the alternative is
 * a library with no history at all, which is worse for an app whose whole
 * argument is that it keeps the dates.
 */
export function simklRows(json: unknown): ForeignRows {
  type SimklSeason = { number?: number; episodes?: { number?: number; watched_at?: string }[] };
  type SimklEntry = ForeignItem & {
    status?: string;
    added_to_watchlist_at?: string;
    seasons?: SimklSeason[];
    /** Simkl's memo: `{ text, is_private }`, or `{}` when none is set. */
    memo?: { text?: string };
  };
  const doc = (json ?? {}) as { shows?: SimklEntry[]; anime?: SimklEntry[]; movies?: SimklEntry[] };
  const history: ForeignItem[] = [];
  const ratings: ForeignItem[] = [];
  const watchlist: ForeignItem[] = [];
  /** Shows with nothing watched yet (Simkl's "plan to watch"): followed, no episodes. */
  const followOnly = new Map<string, string>();
  /** Shows the user dropped on Simkl: they arrive archived, as TV Time's "stopped". */
  const dropped = new Set<string>();
  const notes: NonNullable<ForeignRows['notes']> = { shows: [], movies: [] };
  const memoText = (e: SimklEntry) => (typeof e.memo?.text === 'string' ? e.memo.text.trim() : '');

  // THE REAL FILE NESTS: `{ status, seasons, show: { title, ids } }`. The flat
  // `{ title, ids, seasons }` the first version assumed is still read, for any
  // older or hand-made file.
  const titleOf = (e: SimklEntry, key: 'show' | 'movie'): ForeignTitle => e[key] ?? { title: e.title, year: e.year, ids: e.ids };

  // ANIME FILMS ARE FILMS. Simkl lists them under anime with `anime_type:
  // "movie"`, and their tvdb id is a TheTVDB FILM id: read as a show it named a
  // poster-less "show" (Spirited Away, Totoro) and could collide with a real
  // series holding the same number.
  const anime = doc.anime ?? [];
  const animeFilms = anime.filter((e) => (e as { anime_type?: string }).anime_type === 'movie');
  const animeShows = anime.filter((e) => (e as { anime_type?: string }).anime_type !== 'movie');
  const movieTmdb: NonNullable<ForeignRows['movieTmdb']> = [];

  // The rest of the anime list is, on TheTVDB, just more shows.
  for (const entry of [...(doc.shows ?? []), ...animeShows]) {
    const show = titleOf(entry, 'show');
    let episodes = 0;
    for (const season of entry.seasons ?? []) {
      for (const ep of season.episodes ?? []) {
        episodes += 1;
        history.push({
          watched_at: ep.watched_at ?? entry.last_watched_at ?? '',
          show: { title: show.title, ids: show.ids },
          episode: { season: season.number, number: ep.number },
        });
      }
    }
    const tvdb = idText(show.ids?.tvdb);
    if (episodes === 0 && tvdb && show.title) followOnly.set(tvdb, show.title);
    if (tvdb && entry.status === 'dropped') dropped.add(tvdb);
    const memo = memoText(entry);
    if (tvdb && memo) notes.shows.push({ showId: Number(tvdb), season: -1, episode: -1, text: memo });
  }

  for (const entry of [...(doc.movies ?? []), ...animeFilms]) {
    const m = entry.movie ?? titleOf(entry, 'show');
    const tmdb = Number(m.ids?.tmdb);
    if (m.title && Number.isFinite(tmdb) && tmdb > 0) movieTmdb.push({ name: m.title, tmdbId: tmdb });
    // `plantowatch` is Simkl's watchlist; anything else with a date is a watch.
    const item: ForeignItem = { movie: { title: m.title, year: m.year, ids: m.ids }, type: 'movie' };
    if (entry.status === 'plantowatch') watchlist.push({ ...item, listed_at: entry.added_to_watchlist_at ?? entry.watched_at ?? '' });
    else history.push({ ...item, watched_at: entry.watched_at ?? entry.last_watched_at ?? '' });
    if (entry.user_rating != null) ratings.push({ ...item, rating: entry.user_rating });
    const memo = memoText(entry);
    if (m.title && memo) notes.movies.push({ movie: m.title, text: memo });
  }

  const rows = traktRows({ history, watchlist, ratings });
  for (const r of rows.showRows) if (dropped.has(r.tv_show_id)) r.archived = '1';
  const have = new Set(rows.showRows.map((r) => r.tv_show_id));
  for (const [tvdb, name] of followOnly) {
    if (!have.has(tvdb)) rows.showRows.push({ tv_show_id: tvdb, tv_show_name: name, is_followed: '1', is_favorited: '0', archived: dropped.has(tvdb) ? '1' : '0' });
  }
  if (notes.shows.length || notes.movies.length) rows.notes = notes;
  if (movieTmdb.length) rows.movieTmdb = movieTmdb;
  return rows;
}

/**
 * SERIALIZD — the "Letterboxd for TV" that TV Time's refugees were pointed at
 * most, free and built on TMDB. Asked for on 5 Oct 2026 (CHANGELOG 2.0.0,
 * item 11).
 *
 * THERE IS NO EXPORT, and that has to be said before anything else. As of
 * August 2026 Serializd has no export button and no public API, and the
 * developer says one is planned (achriom.com/blog/import-data-into-serializd;
 * docs.simkl.org, "Simkl vs Serializd"). The one tool that moves data OUT —
 * github.com/mwsmws22/serializd_to_trakt — logs in with the user's password,
 * reads the site's private API and writes Trakt ids only, which this app
 * cannot place.
 *
 * SO THIS READS SERIALIZD'S OWN VOCABULARY, which IS public: it is what that
 * script reads off the API, field for field (10 Oct 2026):
 *   - `/api/user_information?shouldGetUserContext=true` answers
 *     `{ context: { watched, currentlyWatching, droppedShows, pausedShows,
 *     watchlist } }`, each a list of season records with `showId` and
 *     `dateAdded`;
 *   - `/api/show/{showId}` names the show and its `seasons`, each with a
 *     `seasonNumber`;
 *   - a season's page carries `episodeLogs`, each `{ episodeNumber, dateAdded }`;
 *   - the script's own flattened record is `{ showId, showName, seasonNumber,
 *     episodeNumber, dateAdded }`.
 * `showId` IS THE TMDB ID: the script finds the show on Trakt with
 * `/search/tmdb/{showId}`. Whatever file eventually reaches a phone — the
 * promised export, a saved API reply, a data request answered by the
 * developer — is a dump of these same objects, so the reader walks ANY
 * nesting and collects every record it recognises rather than betting on one
 * file layout nobody has seen.
 *
 * ASSUMPTIONS, each marked where it is made, all waiting on a real file:
 *   1. a record is an object with `showId` (or `tmdbId`) that carries a
 *      `dateAdded` or sits in one of the five lists, or an `episodeNumber`
 *      under such a show — anything less is somebody else's JSON (OpenTV's
 *      own backup sidecar has `showId` on its rating rows, and must not read
 *      as Serializd);
 *   2. `rating` is stars out of five, with halves — the site rates episodes
 *      on a half-star scale — unless any rating in the file exceeds 5, which
 *      means the file counts to ten;
 *   3. review text sits in `review` or `reviewText`;
 *   4. a season record with no `episodeLogs` is a followed show and nothing
 *      more. Whether the export carries a season's episodes inline is the
 *      first thing a real file will settle.
 *
 * TMDB ID IN, TheTVDB ID OUT. This app keys shows by TheTVDB id, so every
 * Serializd show needs one answer before its rows mean anything — and that
 * answer needs the network, which nothing in this file touches. So it is two
 * pure halves around one networked step: `serializdRecords` flattens the
 * file, the importer resolves the distinct `showId`s, and `serializdRows`
 * maps the records through that link. A show the link cannot place is
 * dropped rather than matched by name, for the reason `traktRows` gives.
 */
export type SerializdRecord = {
  /** The show's TMDB id. */
  showId: number;
  /** As the file names it; '' when it does not (a context dump names nothing). */
  showName: string;
  season: number | null;
  episode: number | null;
  /** `dateAdded`, ISO as Serializd writes it; '' when absent. */
  at: string;
  rating: number | null;
  review: string;
  /** Which of the five account lists the record sat in, if any. */
  list: string | null;
};

/** What the importer resolved a Serializd show to. */
export type SerializdLink = { tvdbId: number; name: string };

const SERIALIZD_LISTS = new Set(['watched', 'currentlyWatching', 'droppedShows', 'pausedShows', 'watchlist']);

/** A number, whether the file wrote it as one or as digits in a string. */
const numOf = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
};
const strOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** What an object inherits from the objects above it. */
type SerializdCtx = { showId: number | null; showName: string; season: number | null; list: string | null };

function walkSerializd(v: unknown, ctx: SerializdCtx, out: SerializdRecord[]): void {
  if (Array.isArray(v)) {
    for (const x of v) walkSerializd(x, ctx, out);
    return;
  }
  if (!isObject(v)) return;
  const own = numOf(v.showId ?? v.tmdbId ?? v.tmdb_id);
  const showId = own ?? ctx.showId;
  // `showName` only: a season record's `name` is the SEASON's ("Season 14").
  const showName = strOf(v.showName) || ctx.showName;
  const season = numOf(v.seasonNumber) ?? ctx.season;
  const episode = numOf(v.episodeNumber);
  const at = strOf(v.dateAdded);
  // ASSUMPTION 1: what counts as a record.
  const isRecord = showId != null && showId > 0 && (episode != null || (own != null && (at !== '' || ctx.list != null)));
  if (isRecord) {
    // ASSUMPTION 3: where a review's text lives.
    out.push({ showId, showName, season, episode, at, rating: numOf(v.rating), review: strOf(v.review ?? v.reviewText), list: ctx.list });
  }
  const next: SerializdCtx = { showId, showName, season, list: ctx.list };
  for (const [k, x] of Object.entries(v)) {
    if (x == null || typeof x !== 'object') continue;
    walkSerializd(x, SERIALIZD_LISTS.has(k) ? { ...next, list: k } : next, out);
  }
}

/** Every Serializd record in a file, whatever it is nested in. Empty means
 *  the file is not Serializd's — which is how `classifyForeignJson` knows. */
export function serializdRecords(json: unknown): SerializdRecord[] {
  const out: SerializdRecord[] = [];
  walkSerializd(json, { showId: null, showName: '', season: null, list: null }, out);
  return out;
}

export function serializdRows(records: readonly SerializdRecord[], link: ReadonlyMap<number, SerializdLink>): ForeignRows {
  /*
   * ASSUMPTION 2: THE SCALE. Out of five with halves is what the site shows,
   * and since 2.0.0 a half star stays a half (3.5 is 7). A file that counts to
   * ten declares itself by holding a score above 5, and is kept as it is.
   */
  const outOfTen = records.some((r) => (r.rating ?? 0) > 5);
  const tenOf = (rating: number | null): number | null => (outOfTen ? ratingFromTen(rating) : ratingFromStars(rating));

  // One show row per show: named by the file where it says and by the link
  // where it does not; archived if ANY record puts it among the dropped, the
  // way the community export's "stopped" becomes archived.
  const shows = new Map<number, { tvdbId: number; name: string; archived: boolean }>();
  for (const r of records) {
    const hit = link.get(r.showId);
    if (!hit) continue;
    const cur = shows.get(r.showId) ?? { tvdbId: hit.tvdbId, name: '', archived: false };
    cur.name ||= r.showName || hit.name;
    cur.archived ||= r.list === 'droppedShows';
    shows.set(r.showId, cur);
  }

  const episodeRows: Record<string, string>[] = [];
  const episodeRatings: NonNullable<ForeignRows['episodeRatings']> = [];
  const comments: NonNullable<ForeignRows['comments']> = [];
  for (const r of records) {
    const show = shows.get(r.showId);
    if (!show) continue;
    const { season, episode } = r;
    const onEpisode = season != null && episode != null;
    if (onEpisode) {
      episodeRows.push({
        s_id: String(show.tvdbId),
        season_number: String(season),
        episode_number: String(episode),
        created_at: r.at,
        series_name: show.name,
      });
      // Keyed by name downstream, exactly like the GDPR votes file, so a show
      // the link could not name has nowhere to hang a score.
      const ten = tenOf(r.rating);
      if (ten != null && show.name) episodeRatings.push({ name: show.name, season, episode, ten });
    }
    /*
     * NOT IMPORTED: season and show ratings. This app rates episodes, and
     * spreading one season score across its episodes would invent opinions
     * nobody expressed — the rule `traktRows` keeps for show scores.
     *
     * REVIEWS ARE COMMENTS. An episode's lands on the episode, in the entity
     * grammar the comments table keeps. A season's has no slot of its own —
     * Serializd's unit is the season, this app's is the show or the episode —
     * so it lands on the show with the season named up front, in the app's
     * own S-notation, rather than losing which season it was about.
     */
    if (r.review && show.name) {
      comments.push({
        entity: onEpisode ? `${show.name} S${season}E${episode}` : show.name,
        text: !onEpisode && season != null ? `S${season}: ${r.review}` : r.review,
        date: r.at,
      });
    }
  }

  const showRows = [...shows.values()].map((s) => ({
    tv_show_id: String(s.tvdbId),
    tv_show_name: s.name,
    is_followed: '1',
    is_favorited: '0',
    archived: s.archived ? '1' : '0',
  }));

  return { showRows, episodeRows, movieRows: [], movieRatings: [], episodeRatings, comments };
}

/**
 * SOFA TIME — asked for by a user in Saudi Arabia, who sent his real export on
 * 26 Oct 2026. A ZIP of six JSON arrays: `watchedShow_…`, `stopWatchingShow_…`,
 * `watchlistShow_…` and the same three for films.
 *
 * EVERY ITEM CARRIES ITS TMDB ID (`tmdb`, a number), so nothing is matched by
 * title — but it is a TMDB id, and this app keys shows by TheTVDB id. So it is
 * the Serializd shape again: `sofaTimeItems` reads the files, the importer
 * resolves the distinct show ids, and `sofaTimeRows` maps through that link.
 *
 * WHICH PILE AN ITEM IS IN is known by its content where the content says:
 * `archive_type` ("dropped" / "hold") is a stopped show, and `seasons` with
 * episodes in them is a watched one. A FILM carries neither, and only the file
 * name tells a watched film from a wanted one -- the one place this reads a
 * name, and only to sort an item already known to be Sofa Time's by its shape.
 *
 * The film files were empty in the only real export seen, so their shape is
 * ASSUMED: the show fields without `seasons`, and `rating` out of ten like an
 * episode's.
 */
export type SofaItem = {
  kind: 'show' | 'movie';
  list: 'watched' | 'stopped' | 'watchlist';
  tmdb: number;
  title: string;
  year: string;
  /** `addedDate`: when it went on the list, or when a film was marked seen. */
  at: string;
  runtime: number | null;
  rating: number | null;
  episodes: { season: number; episode: number; at: string; rating: number | null }[];
};

const isSofaItem = (v: unknown): v is Record<string, unknown> =>
  isObject(v) && typeof v.tmdb === 'number' && (v.type === 'tv' || v.type === 'movie') && typeof v.addedDate === 'string';

/** Every Sofa Time item in a set of parsed JSON files, keyed by file path.
 *  Empty means the files are not Sofa Time's. */
export function sofaTimeItems(files: Readonly<Record<string, unknown>>): SofaItem[] {
  const out: SofaItem[] = [];
  for (const [path, json] of Object.entries(files)) {
    if (!Array.isArray(json) || !json.some(isSofaItem)) continue;
    const base = (path.split('/').pop() ?? '').toLowerCase();
    for (const v of json) {
      if (!isSofaItem(v)) continue;
      const episodes: SofaItem['episodes'] = [];
      for (const s of Array.isArray(v.seasons) ? v.seasons : []) {
        const season = isObject(s) ? numOf(s.number) : null;
        if (season == null || !isObject(s)) continue;
        for (const e of Array.isArray(s.episodes) ? s.episodes : []) {
          const episode = isObject(e) ? numOf(e.number) : null;
          if (episode == null || !isObject(e)) continue;
          episodes.push({ season, episode, at: strOf(e.addedDate), rating: numOf(e.rating) });
        }
      }
      const list: SofaItem['list'] =
        v.archive_type != null || base.startsWith('stopwatching')
          ? 'stopped'
          : episodes.length > 0 || base.startsWith('watched')
            ? 'watched'
            : 'watchlist';
      out.push({
        kind: v.type === 'tv' ? 'show' : 'movie',
        list,
        tmdb: v.tmdb as number,
        title: strOf(v.title),
        year: strOf(v.release_date).slice(0, 4),
        at: strOf(v.addedDate),
        runtime: numOf(v.runtime),
        rating: numOf(v.rating),
        episodes,
      });
    }
  }
  return out;
}

export function sofaTimeRows(items: readonly SofaItem[], link: ReadonlyMap<number, SerializdLink>): ForeignRows {
  const rows: ForeignRows = { showRows: [], episodeRows: [], movieRows: [], movieRatings: [], episodeRatings: [], movieTmdb: [] };
  const shows = new Map<number, { name: string; archived: boolean }>();
  const seenEp = new Set<string>();

  for (const item of items) {
    if (item.kind === 'movie') {
      /* A FILM YOU STOPPED WATCHING has nowhere to go: it is neither seen nor
         still wanted, and this app has no "abandoned" for films. Left out
         rather than guessed into one or the other. */
      if (item.list === 'stopped' || !item.title) continue;
      rows.movieTmdb!.push({ name: item.title, tmdbId: item.tmdb });
      const watched = item.list === 'watched';
      rows.movieRows.push({ type: watched ? 'watch' : 'towatch', entity_type: 'movie', movie_name: item.title, movie_year: item.year, created_at: item.at });
      const ten = watched ? ratingFromTen(item.rating) : null;
      if (ten != null) rows.movieRatings.push({ name: item.title, ten });
      continue;
    }

    // No TheTVDB id: reported by the importer's link step, never matched by name.
    const hit = link.get(item.tmdb);
    if (!hit) continue;
    const cur = shows.get(hit.tvdbId) ?? { name: '', archived: false };
    cur.name ||= item.title || hit.name;
    // "dropped" and "hold" both: off the Watch Next list, history kept — TV Time's "stopped".
    cur.archived ||= item.list === 'stopped';
    shows.set(hit.tvdbId, cur);

    for (const ep of item.episodes) {
      const key = `${hit.tvdbId}-${ep.season}-${ep.episode}`;
      if (seenEp.has(key)) continue;
      seenEp.add(key);
      rows.episodeRows.push({
        s_id: String(hit.tvdbId),
        season_number: String(ep.season),
        episode_number: String(ep.episode),
        // An episode's own `addedDate` is the day it was ticked; the show's is a fallback.
        created_at: ep.at || item.at,
        series_name: cur.name,
        runtime: item.runtime ? String(item.runtime) : '',
      });
      // Rare in the real file, and out of ten as the app's own scale is.
      const ten = ratingFromTen(ep.rating);
      if (ten != null && cur.name) rows.episodeRatings!.push({ name: cur.name, season: ep.season, episode: ep.episode, ten });
    }
  }

  // A watchlist show arrives followed with nothing seen, as Simkl's "plan to watch" does.
  rows.showRows = [...shows].map(([tvdbId, s]) => ({
    tv_show_id: String(tvdbId),
    tv_show_name: s.name,
    is_followed: '1',
    is_favorited: '0',
    archived: s.archived ? '1' : '0',
  }));
  return rows;
}

/**
 * BINGERS — the biggest of TV Time's successors, asked for on r/TVTime on 26
 * Oct 2026, the same day Mahmood exported his own library from it.
 *
 * FOUR UTF-8 CSVs WITH A BOM: `library.csv` (what you follow, favourite, keep
 * for later or stopped), `watches.csv` (one row per episode or film, with
 * `plays`), `ratings.csv` (one to five, a favourite character, emotions) and
 * `lists.csv`. Known by their header rows, never by their names.
 *
 * EVERY ROW CARRIES A TheTVDB ID, A TMDB ID, OR BOTH, so nothing is matched by
 * title. A show with only a TMDB id goes through the same link step as
 * Serializd's; a film is looked up by its TMDB id, as Simkl's are.
 *
 * WHAT MAPS, and onto what the app already has:
 *   - `plays` above one is rewatches: the first play is the watch, every
 *     further play a rewatch row dated `last_watched_at` (the plays in between
 *     have no date in the file); a film's become its rewatch count;
 *   - `for_later` is the watchlist, `stopped_watching_at` is archived;
 *   - the seven emotions are all among the app's twelve;
 *   - `favorite_character` can name several, and the app keeps ONE favourite
 *     per episode: the first is kept;
 *   - `favorite` and `lists.csv` become the favourites rows and custom lists,
 *     in TV Time's own list shape so the importer's list code places them.
 * NOT MAPPED: `hidden_at`, which has no meaning here, and list descriptions,
 * which the app's lists do not have.
 */
export type BingersTables = {
  library: Record<string, string>[];
  watches: Record<string, string>[];
  ratings: Record<string, string>[];
  lists: Record<string, string>[];
};

/** The BOM rides on the first header ("﻿type"), and `parseCsv` keeps it. */
const csvKey = (h: string): string => h.replace(/^﻿/, '').trim().toLowerCase();

/** Which of the four Bingers files this header row is, if any. */
export function bingersTableKind(header: readonly string[]): keyof BingersTables | null {
  const k = new Set(header.map(csvKey));
  if (!k.has('type') || !k.has('tvdb_id') || !k.has('tmdb_id')) return null;
  if (k.has('list_status')) return 'library';
  if (k.has('plays')) return 'watches';
  if (k.has('favorite_character') || k.has('emotions')) return 'ratings';
  if (k.has('list_name')) return 'lists';
  return null;
}

/** One parsed Bingers CSV with its keys de-BOMed and lowercased, values trimmed. */
export function bingersTable(rows: readonly Record<string, string>[]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [csvKey(k), (v ?? '').trim()])));
}

const isBingersShow = (r: Record<string, string>): boolean => r.type === 'show' || r.type === 'episode';

/** Shows (and episodes) that name only a TMDB id: the ones the link step must place. */
export function bingersTmdbOnlyShows(t: BingersTables): { showId: number; showName: string }[] {
  const out = new Map<number, string>();
  for (const r of [...t.library, ...t.watches, ...t.ratings]) {
    const tmdb = Number(r.tmdb_id);
    if (isBingersShow(r) && !(Number(r.tvdb_id) > 0) && tmdb > 0 && !out.has(tmdb)) out.set(tmdb, r.title ?? '');
  }
  return [...out].map(([showId, showName]) => ({ showId, showName }));
}

/**
 * A uuid for a film that TV Time's list rows can carry. Those rows name films
 * ONLY by uuid (see `listEntries`), so a film on a Bingers list is given one
 * made from its TMDB id, and its movie rows carry the same one for
 * `movieNamesByUuid` to name it by. Same id, same uuid, every import.
 */
const filmUuid = (tmdb: number): string => `00000000-0000-4000-8000-${tmdb.toString(16).padStart(12, '0')}`;

export function bingersRows(t: BingersTables, link: ReadonlyMap<number, SerializdLink>): ForeignRows {
  const rows: ForeignRows = {
    showRows: [],
    episodeRows: [],
    movieRows: [],
    movieRatings: [],
    episodeRatings: [],
    movieTmdb: [],
    episodeEmotions: [],
    movieEmotions: [],
    episodeCharacters: [],
    movieCharacters: [],
    listRows: [],
  };
  const tvdbOf = (r: Record<string, string>): number => Number(r.tvdb_id) || link.get(Number(r.tmdb_id))?.tvdbId || 0;
  const intOf = (v: string | undefined): number | null => (/^\d+$/.test(v ?? '') ? Number(v) : null);

  // ---- names: the library's, then any row's, then the link's ----------------
  const showName = new Map<number, string>();
  const filmName = new Map<number, string>();
  const filmYear = new Map<number, string>();
  for (const r of [...t.library, ...t.watches, ...t.ratings, ...t.lists]) {
    if (!r.title) continue;
    if (isBingersShow(r)) {
      const id = tvdbOf(r);
      if (id && !showName.has(id)) showName.set(id, r.title);
    } else if (r.type === 'movie') {
      const id = Number(r.tmdb_id);
      if (id > 0 && !filmName.has(id)) filmName.set(id, r.title);
      if (id > 0 && r.year && !filmYear.has(id)) filmYear.set(id, r.year);
    }
  }
  for (const hit of link.values()) if (!showName.has(hit.tvdbId) && hit.name) showName.set(hit.tvdbId, hit.name);
  const film = (r: Record<string, string>): { tmdb: number; name: string } | null => {
    const tmdb = Number(r.tmdb_id);
    const name = filmName.get(tmdb) ?? '';
    return tmdb > 0 && name ? { tmdb, name } : null;
  };

  // ---- shows -----------------------------------------------------------------
  const shows = new Map<number, { archived: boolean; favorite: boolean }>();
  for (const r of t.library) {
    const id = r.type === 'show' ? tvdbOf(r) : 0;
    if (id) shows.set(id, { archived: !!r.stopped_watching_at, favorite: r.favorite === 'yes' });
  }

  // ---- watches ---------------------------------------------------------------
  const films = new Map<number, string>();
  const seenEp = new Set<string>();
  for (const r of t.watches) {
    const plays = Math.max(1, intOf(r.plays) ?? 1);
    if (r.type === 'episode') {
      const id = tvdbOf(r);
      const season = intOf(r.season_number);
      const episode = intOf(r.episode_number);
      if (!id || season == null || episode == null) continue;
      const key = `${id}-${season}-${episode}`;
      if (seenEp.has(key)) continue;
      seenEp.add(key);
      if (!shows.has(id)) shows.set(id, { archived: false, favorite: false });
      const row = { s_id: String(id), season_number: String(season), episode_number: String(episode), series_name: showName.get(id) ?? '' };
      rows.episodeRows.push({ ...row, created_at: r.first_watched_at || r.last_watched_at || '' });
      // The importer's rewatch flag, one row per extra play.
      for (let i = 1; i < plays; i++) rows.episodeRows.push({ ...row, created_at: r.last_watched_at || r.first_watched_at || '', rewatch_count: '1' });
      continue;
    }
    const f = r.type === 'movie' ? film(r) : null;
    if (!f || films.has(f.tmdb)) continue;
    films.set(f.tmdb, f.name);
    rows.movieRows.push({
      type: 'watch',
      entity_type: 'movie',
      movie_name: f.name,
      movie_year: filmYear.get(f.tmdb) ?? '',
      created_at: r.first_watched_at || r.last_watched_at || '',
      rewatch_count: String(plays - 1),
      uuid: filmUuid(f.tmdb),
    });
  }
  for (const r of t.library) {
    const f = r.type === 'movie' && r.list_status === 'for_later' ? film(r) : null;
    if (!f) continue;
    films.set(f.tmdb, f.name);
    rows.movieRows.push({ type: 'towatch', entity_type: 'movie', movie_name: f.name, movie_year: filmYear.get(f.tmdb) ?? '', created_at: r.for_later_at || r.added_at || '', uuid: filmUuid(f.tmdb) });
  }

  rows.showRows = [...shows].map(([id, s]) => ({
    tv_show_id: String(id),
    tv_show_name: showName.get(id) ?? '',
    is_followed: '1',
    is_favorited: s.favorite ? '1' : '0',
    archived: s.archived ? '1' : '0',
  }));

  // ---- ratings, emotions, favourite characters ------------------------------
  for (const r of t.ratings) {
    const ten = ratingFromStars(intOf(r.rating));
    const emotions = (r.emotions ?? '')
      .split('|')
      .map((e) => (EMOTION_NAMES as readonly string[]).indexOf(e.trim().toLowerCase()))
      .filter((i) => i >= 0);
    const character = (r.favorite_character ?? '').split('|')[0].trim();
    if (r.type === 'episode') {
      const id = tvdbOf(r);
      const name = showName.get(id);
      const season = intOf(r.season_number);
      const episode = intOf(r.episode_number);
      if (!id || !name || season == null || episode == null) continue;
      if (ten != null) rows.episodeRatings!.push({ name, season, episode, ten });
      for (const emotion of emotions) rows.episodeEmotions!.push({ name, season, episode, emotion });
      if (character) rows.episodeCharacters!.push({ name, season, episode, character });
    } else if (r.type === 'movie') {
      const f = film(r);
      if (!f) continue;
      if (ten != null) rows.movieRatings.push({ name: f.name, ten });
      for (const i of emotions) rows.movieEmotions!.push({ name: f.name, value: i + 28 });
      if (character) rows.movieCharacters!.push({ movie: f.name, character });
    }
  }

  // ---- favourites and lists, as TV Time's list rows --------------------------
  const seriesEntry = (id: number) => `map[id:${id} type:series]`;
  const filmEntry = (tmdb: number) => `map[type:movie uuid:${filmUuid(tmdb)}]`;
  const favShows = [...shows].filter(([, s]) => s.favorite).map(([id]) => seriesEntry(id));
  const favFilms = t.library.filter((r) => r.type === 'movie' && r.favorite === 'yes' && films.has(Number(r.tmdb_id))).map((r) => filmEntry(Number(r.tmdb_id)));
  if (favShows.length) rows.listRows!.push({ type: 'list', s_key: 'favorite-series', objects: `[${favShows.join(' ')}]` });
  if (favFilms.length) rows.listRows!.push({ type: 'list', s_key: 'favorite-movies', objects: `[${favFilms.join(' ')}]` });

  const lists = new Map<string, string[]>();
  for (const r of t.lists) {
    const name = r.list_name;
    if (!name) continue;
    const entries = lists.get(name) ?? [];
    lists.set(name, entries);
    if (isBingersShow(r)) {
      const id = tvdbOf(r);
      if (id) entries.push(seriesEntry(id));
      continue;
    }
    const f = r.type === 'movie' ? film(r) : null;
    if (!f) continue;
    entries.push(filmEntry(f.tmdb));
    /* A FILM ON A LIST AND NOWHERE ELSE still needs its name found by uuid.
       A row of no type the importer counts — not a watch, not the watchlist —
       names it without putting it in the library, as a TV Time list does. */
    if (!films.has(f.tmdb)) {
      films.set(f.tmdb, f.name);
      rows.movieRows.push({ type: 'list', entity_type: 'movie', movie_name: f.name, uuid: filmUuid(f.tmdb) });
    }
  }
  for (const [name, entries] of lists) rows.listRows!.push({ type: 'list', s_key: '', name, objects: `[${entries.join(' ')}]`, created_at: '' });

  for (const [tmdbId, name] of films) rows.movieTmdb!.push({ name, tmdbId });
  return rows;
}
