/**
 * "Compare with the people you follow" — the arithmetic, with no I/O, so a test
 * can reach all of it. The screen is `app/compare.tsx`.
 *
 * EVERYTHING ABOUT THE OTHER PERSON IS WHAT THEIR PROFILE ALREADY PUBLISHES —
 * `GET /v1/profiles/:handle/published`, the same read their profile page makes,
 * with the same block, private and hidden-section rules applied by the server.
 * Nothing about YOU is sent anywhere: your side is read from this phone, and
 * the comparison happens here.
 */

/** One person's column. Null is "not published", which is not zero. */
export type CompareSide = { minutes: number | null; episodes: number | null; films: number | null };

/** The `stats` block of a published profile, as the wire sends it. */
type PublishedStats = {
  episodes_watched: number;
  minutes_watched: number;
  movie_minutes: number;
  movies_count: number;
} | null;

/** Their column, from what they publish. A hidden or never-published stats
 *  section arrives as null, and stays a dash rather than becoming a zero. */
export function sideFromPublished(stats: PublishedStats): CompareSide {
  if (!stats) return { minutes: null, episodes: null, films: null };
  return {
    minutes: (stats.minutes_watched ?? 0) + (stats.movie_minutes ?? 0),
    episodes: stats.episodes_watched ?? 0,
    films: stats.movies_count ?? 0,
  };
}

/** Title keys, in the shelf's own order (most recently watched first). */
export type ShelfKeys = { shows: readonly string[]; movies: readonly string[] };

export type TasteMatch = {
  showsInCommon: number;
  filmsInCommon: number;
  /** 0–100, or null when either side has nothing to compare. */
  percent: number | null;
};

/**
 * HOW ALIKE TWO SHELVES ARE: the Sørensen–Dice coefficient,
 * 2·|both| / (|mine| + |theirs|), shows and films pooled.
 *
 * Not "how many of theirs I have" — that is 100% for anybody whose whole
 * library is three shows I also watched. Dice counts what each of you has that
 * the other does not, so two people only match when both shelves agree.
 *
 * THEIR SHELF MAY BE CUT SHORT, and mine never is: a free profile publishes its
 * `cap` most recent titles of each kind, while this phone knows its whole
 * library. Measured as-is, a 900-show library compared with an identical one
 * would match at 43%. So when their shelf of a kind is exactly at the cap, mine
 * is cut to the same length for the percentage — recent against recent. The
 * "in common" counts still use my whole library: a title of theirs I watched
 * ten years ago is still in common.
 */
export function tasteMatch(mine: ShelfKeys, theirs: ShelfKeys, cap: number): TasteMatch {
  const kind = (m: readonly string[], th: readonly string[]) => {
    const theirSet = new Set(th);
    const mineAll = new Set(m);
    const mineForPercent = new Set(th.length >= cap ? m.slice(0, th.length) : m);
    let common = 0;
    for (const k of theirSet) if (mineAll.has(k)) common++;
    let commonForPercent = 0;
    for (const k of theirSet) if (mineForPercent.has(k)) commonForPercent++;
    return { common, commonForPercent, mine: mineForPercent.size, theirs: theirSet.size };
  };
  const s = kind(mine.shows, theirs.shows);
  const f = kind(mine.movies, theirs.movies);
  const total = s.mine + s.theirs + f.mine + f.theirs;
  const percent = s.mine + f.mine === 0 || s.theirs + f.theirs === 0 ? null : Math.round((200 * (s.commonForPercent + f.commonForPercent)) / total);
  return { showsInCommon: s.common, filmsInCommon: f.common, percent };
}
