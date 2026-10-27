/**
 * "Guess the title" — the daily puzzle's rules, with no I/O.
 *
 * ONE TITLE A DAY, SIX TRIES, A CLUE PER MISS. A show or, since 14 Oct, a
 * film — whichever the day picks out of what the player has watched. Wordle's lesson is not the word
 * game, it is the shape: one puzzle for everybody today, a grid of squares that
 * says how it went without saying what it was, and three numbers — played,
 * win %, average tries — that make tomorrow matter. The streak was taken out
 * on 14 Oct because the profile already shows a WATCHING streak, and two
 * streaks on one page read as one confused number. It came back on 22 Oct
 * (`puzzleStreak`) ONLY on the puzzle's own result screen, labelled 🧩 and
 * "puzzle streak" — and, since the same day, on the owner's own profile when
 * they opt in (`puzzleStreakShown`), but never in the share text, the
 * published block or anything else that leaves the phone. The edge nobody else has is WHERE THE SHOW COMES FROM — a
 * still from a show the player has actually watched, which `puzzle-data.ts`
 * picks from the library. Framed and Moviedle cannot do that; they do not have
 * your history.
 *
 * PURE, like `games.ts` and `notification-plan.ts`: every judgement here —
 * which show today, what a miss reveals, what the stats come to,
 * what the share text says — is a function of plain values, so it is tested
 * under Node and the screen only draws. `puzzle-data.ts` is the half that
 * reads SQLite.
 *
 * DAYS ARE 'YYYY-MM-DD' IN THE PHONE'S OWN ZONE (`localDayStamp`), never UTC:
 * a puzzle that changed at 01:00 for half of Europe would be a different game
 * from the one the share text claims.
 */

import type { LocaleKey } from '@/locales/keys';

export const MAX_TRIES = 6;

/**
 * EACH PLAYER'S OWN #1 (22 Oct, Mahmood): the number counts from the day THIS
 * person first played, not from a shared launch day. The puzzle is drawn from
 * your own library, so two friends never had the same "#12" to compare anyway;
 * a personal count reads as "my 12th day". Days before the first clamp to 1.
 */

/**
 * How blurred the still is before each miss, as `expo-image`'s `blurRadius`.
 *
 * The first two entries ARE the first two clues ("very blurred" → "less
 * blurred"); after that the text clues take over and the picture keeps
 * sharpening a little each miss so the last try is nearly a plain frame. Zero
 * once the game is over, whatever happened — the reveal is part of the reward.
 */
export const BLUR: readonly number[] = [36, 20, 14, 10, 6, 3];

/**
 * In order of revelation: one per miss, the first one free.
 *
 * THE KIND COMES FIRST (14 Oct), once films joined: "Series · 2010" or
 * "Film · 2006" halves the answer box before anything else does, and it is the
 * fairest thing to give — a player who cannot tell a still from a film frame
 * has not lost anything they could have known. Then the genre; then what is
 * particular to the kind (network and seasons, or director and runtime); then
 * a lead actor; and last the character, which for a show is the one this
 * person voted for most.
 *
 * The country clue of 10 Oct went with this order; `ShowMeta.country` is still
 * cached and costs nothing where it is.
 */
export const CLUES = ['still', 'kindYear', 'genre', 'details', 'actor', 'character'] as const;
export type Clue = (typeof CLUES)[number];

// ── ids: a show or a film ───────────────────────────────────────────────────

/**
 * What a game, a guess and a history row call a title.
 *
 * A SHOW IS STILL A BARE NUMBER — its TheTVDB id, exactly as every save before
 * films stored it — so nothing already on a phone needs migrating: an old
 * game, an old history row and an old `avoid` list read as shows because that
 * is what they are. A FILM is a string, `m:<tmdbId>`, or `m:n:<name>` for a
 * library film nobody matched to TMDB (its name is the `movies` primary key).
 * The two cannot collide: a number is never equal to a string, and the `n:`
 * keeps a film called "603" from being TMDB's 603.
 */
export type PuzzleId = number | string;

export function filmId(tmdbId: number | null | undefined, name: string): string {
  return tmdbId ? `m:${tmdbId}` : `m:n:${name}`;
}

export function isFilmId(id: PuzzleId): id is string {
  return typeof id === 'string' && id.startsWith('m:');
}

/** A stored id from either era, or null for anything this build cannot read.
 *  `SKIP` (0) passes as the number it is. */
export function parseId(v: unknown): PuzzleId | null {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === 'string' && /^m:(\d+|n:.+)$/.test(v)) return v;
  return null;
}

// ── days ────────────────────────────────────────────────────────────────────

/** A day stamp as a UTC midnight, which is the only clock arithmetic that
 *  does not slip an hour at the DST change. */
function utcMidnight(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `b - a` in whole days. Negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / 86_400_000);
}

export function shiftDay(day: string, n: number): string {
  const d = new Date(utcMidnight(day) + n * 86_400_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function puzzleNumber(day: string, firstPlayed: string | null): number {
  return firstPlayed ? Math.max(1, daysBetween(firstPlayed, day) + 1) : 1;
}

// ── which show today ────────────────────────────────────────────────────────

/** FNV-1a over the day stamp. Small, stable, and nothing to do with
 *  `Math.random`: the same day must pick the same show on every open. */
export function hashDay(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Today's show out of the candidates.
 *
 * SORTED FIRST, so the order rows come out of SQLite in cannot change the
 * answer between two opens of the same day. `avoid` is what was played
 * recently; it is honoured when there is anything left after it and ignored
 * when there is not, because a tiny library must still get a puzzle rather
 * than none.
 *
 * The caller PINS the result for the day (`puzzle-data.ts`) — adding a show
 * at lunchtime would otherwise shift the index and change the afternoon's
 * answer under a game already in progress.
 */
export function pickForDay(day: string, ids: readonly PuzzleId[], avoid: readonly PuzzleId[] = []): PuzzleId | null {
  const sorted = [...new Set(ids)].sort(byId);
  if (!sorted.length) return null;
  const skip = new Set(avoid);
  const fresh = sorted.filter((id) => !skip.has(id));
  const pool = fresh.length ? fresh : sorted;
  return pool[hashDay(day) % pool.length];
}

/**
 * Shows by number, then films by code unit — the order the pick indexes into.
 *
 * NUMBERS EXACTLY AS BEFORE, so a library with no watched film is sorted, and
 * therefore answered, the way it was before films existed. Films compare with
 * `<`, never `localeCompare`: the order must not depend on the phone's
 * language, or two phones with the same library would disagree about today.
 */
function byId(a: PuzzleId, b: PuzzleId): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Below this many library candidates the bundled classics join the pool. */
export const MIN_LIBRARY_POOL = 10;

// ── who qualifies ───────────────────────────────────────────────────────────

/**
 * How many watched episodes make a show fair to ask, strictest first.
 *
 * FAIR, NOT MERELY WATCHED (14 Oct). One episode of a show sampled and dropped
 * in 2015 was as likely to be the answer as the show somebody watched for six
 * years, and a still of it is a guess nobody could make. So a show qualifies
 * with at least FOUR watched episodes, OR at least half of what has aired —
 * whichever is easier, so a two-episode miniseries watched to the end counts
 * and a long-running show is not asked to be half done.
 *
 * A SMALL LIBRARY RELAXES BEFORE THE CLASSICS JOIN: four, then three, two,
 * one. A library of nine fair shows and twenty sampled ones would otherwise
 * be padded with classics it never watched while titles it did watch sat
 * out. Only when even "one episode" leaves fewer than `MIN_LIBRARY_POOL` do
 * the classics come in (`candidatePool`), exactly as before.
 *
 * A FILM qualifies by being marked watched; there is no half of a film.
 */
export const EPISODE_STEPS = [4, 3, 2, 1] as const;

/** A watched show as the qualifying rule sees it: distinct episodes seen,
 *  and how many have aired (null when the phone does not know). */
export type ShowSeen = { id: PuzzleId; seen: number; aired: number | null };

export function showQualifies(s: ShowSeen, min: number): boolean {
  if (s.seen <= 0) return false;
  return s.seen >= min || (!!s.aired && s.seen * 2 >= s.aired);
}

/**
 * The library's candidates and the bar they were held to: the first step of
 * `EPISODE_STEPS` that yields `MIN_LIBRARY_POOL` titles, films included, or
 * the last step (any watched episode) when none does — and then the classics
 * join in `candidatePool`. `step` is the episode bar in force: 4 for a
 * library with plenty of fair shows, 1 for a new or tiny one.
 */
export function libraryCandidates(
  shows: readonly ShowSeen[],
  films: readonly PuzzleId[],
): { ids: PuzzleId[]; step: number } {
  let ids: PuzzleId[] = [];
  for (const step of EPISODE_STEPS) {
    ids = [...shows.filter((s) => showQualifies(s, step)).map((s) => s.id), ...films];
    if (ids.length >= MIN_LIBRARY_POOL) return { ids, step };
  }
  return { ids, step: EPISODE_STEPS[EPISODE_STEPS.length - 1] };
}

/**
 * The ids today may be picked from: the library's watched shows AND films
 * with a picture, and the bundled classics only while those are fewer than
 * `MIN_LIBRARY_POOL`. A watched film counts towards the ten exactly as a show
 * does — a library of four shows and six films is a library, not a new
 * install. The classics are all shows: no bundled film carries a title.
 */
export function candidatePool(library: readonly PuzzleId[], classics: readonly PuzzleId[]): PuzzleId[] {
  return library.length >= MIN_LIBRARY_POOL ? [...library] : [...library, ...classics];
}

/** Same hash, for choosing one still out of several — a different lane from
 *  the show pick so the two do not move together. */
export function pickIndex(day: string, count: number, lane = 1): number {
  if (count <= 0) return 0;
  return hashDay(`${day}#${lane}`) % count;
}

// ── never running out ───────────────────────────────────────────────────────

/** No title is the answer twice inside this many days, for one person. */
export const REPEAT_DAYS = 60;

/**
 * One day's answer as it was pinned, and the picture it was asked with.
 *
 * KEPT, NOT DERIVED (14 Oct). A pick derived from the day and the library
 * alone cannot promise "not in sixty days": the library changes — a show is
 * added at lunchtime, a film is deleted — and every derived pick after that
 * moves, so yesterday's answer can come back tomorrow without anything
 * remembering it was yesterday's. So every day that was ever opened, today's
 * or an archive day, is written down with its answer, and the pick avoids
 * what is written down. `pic` is what lets a returning title come back with a
 * DIFFERENT picture.
 */
export type Pinned = { d: string; id: PuzzleId; pic: string | null };

export function parsePinned(v: unknown): Pinned[] {
  if (!Array.isArray(v)) return [];
  const out: Pinned[] = [];
  for (const r of v) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Partial<Record<keyof Pinned, unknown>>;
    const id = parseId(o.id);
    if (typeof o.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.d) || id == null) continue;
    out.push({ d: o.d, id, pic: typeof o.pic === 'string' && o.pic ? o.pic : null });
  }
  return out;
}

/** One row per day, in order, capped like the history. */
export function withPinned(list: readonly Pinned[], p: Pinned): Pinned[] {
  return [...list.filter((x) => x.d !== p.d), p].sort((a, b) => a.d.localeCompare(b.d)).slice(-HISTORY_MAX);
}

/** Answers of the days within `REPEAT_DAYS` of `day`, EITHER SIDE — an
 *  archive day sits between days already played and must not repeat the
 *  later ones either. The day itself is not its own neighbour. */
export function nearIds(pinned: readonly Pinned[], day: string): Set<PuzzleId> {
  return new Set(pinned.filter((p) => p.d !== day && Math.abs(daysBetween(p.d, day)) < REPEAT_DAYS).map((p) => p.id));
}

/**
 * The answer for `day`, out of the watched library and the bundled classics.
 *
 * In order, the first pool with anything in it:
 *   1. the usual pool (`candidatePool`: the library, plus the classics below
 *      `MIN_LIBRARY_POOL`), minus everything near this day;
 *   2. the classics minus everything near — a library of fifteen cannot fill
 *      sixty days on its own, so once it is used up the classics stand in
 *      until its first title is sixty days old;
 *   3. the usual pool as it is. Only reachable with no classics at all (the
 *      bundled metadata missing); a repeat beats no puzzle.
 *
 * Deterministic: the same day, library and record give the same answer. The
 * caller pins it, so it stays that day's answer whatever happens to the
 * library afterwards.
 */
export function pickAnswer(
  day: string,
  library: readonly PuzzleId[],
  classics: readonly PuzzleId[],
  pinned: readonly Pinned[],
): PuzzleId | null {
  const near = nearIds(pinned, day);
  const pool = candidatePool(library, classics);
  const fresh = pool.filter((id) => !near.has(id));
  /*
   * NEVER ASKED BEFORE COMES FIRST. The 60-day rule alone let a title come
   * back on day 61 while others in the library had never been asked at all
   * (developer, 14 Oct: "not the same one twice until the library is
   * finished"). So the whole library goes round once, a title newly watched
   * joins the unasked ones the next day it is opened, and only when every
   * title has been asked does the 60-day rule decide the repeats.
   */
  const asked = new Set(pinned.filter((p) => p.d !== day).map((p) => p.id));
  const unasked = fresh.filter((id) => !asked.has(id));
  if (unasked.length) return pickForDay(day, unasked);
  if (fresh.length) return pickForDay(day, fresh);
  const freshClassics = classics.filter((id) => !near.has(id));
  if (freshClassics.length) return pickForDay(day, freshClassics);
  return pickForDay(day, pool);
}

/**
 * The picture for a day, out of `groups` (best source first), avoiding
 * `used` — the pictures this title was already asked with on other days.
 *
 * The first group with an UNUSED picture wins, and the day picks inside it.
 * When every picture has been used, the best group is reused: the same frame
 * twice is better than none.
 */
export function pickPicture(day: string, groups: readonly (readonly string[])[], used: ReadonlySet<string>): string | null {
  const real = groups.map((g) => [...new Set(g.filter(Boolean))]).filter((g) => g.length);
  for (const g of real) {
    const fresh = g.filter((u) => !used.has(u));
    if (fresh.length) return fresh[pickIndex(day, fresh.length)];
  }
  return real.length ? real[0][pickIndex(day, real[0].length)] : null;
}

/** The pictures `id` was asked with on days other than `day`. */
export function usedPictures(pinned: readonly Pinned[], id: PuzzleId, day: string): Set<string> {
  return new Set(pinned.filter((p) => p.id === id && p.d !== day && p.pic).map((p) => p.pic as string));
}

// ── the archive ─────────────────────────────────────────────────────────────

/**
 * The days the archive lists, newest first: from the first day this person
 * played up to yesterday. Nothing before
 * the first play — an archive of a year nobody here was playing is a wall,
 * not a collection — and nothing at all for somebody who has not played yet.
 */
export function archiveDays(today: string, firstPlayed: string | null): string[] {
  if (!firstPlayed) return [];
  const n = daysBetween(firstPlayed, today);
  return Array.from({ length: Math.max(0, n) }, (_, i) => shiftDay(today, -(i + 1)));
}

// ── one game ────────────────────────────────────────────────────────────────

/** A skipped try. Shown as ⬛: it cost a try, it was not a wrong show. */
export const SKIP = 0;

/**
 * A guess that was a DIFFERENT FILM OF THE ANSWER'S SERIES — Deathly Hallows
 * Part 1 when the answer is Part 2. Shown as 🟨: "right series, wrong part".
 * It is still a miss — it costs a try and unlocks the next clue — but it is
 * not the same miss as a guess at a stranger, and the grid should say so.
 *
 * STORED IN THE GUESS ITSELF as `c:` + the film's id (`c:m:12445`), so the
 * game, the history and the share text all read it from the one list, and an
 * old save, which never has it, reads exactly as it did. Films only: shows
 * have no collections. `guessedId` takes the marker off again.
 */
const CLOSE = 'c:';

export function isClose(g: PuzzleId): boolean {
  return typeof g === 'string' && g.startsWith(CLOSE);
}

/** The title a guess named, close or not. */
export function guessedId(g: PuzzleId): PuzzleId {
  return isClose(g) ? (g as string).slice(CLOSE.length) : g;
}

/** A stored guess: an id as `parseId` reads it, or a close marker on a film. */
function parseGuess(v: unknown): PuzzleId | null {
  if (typeof v === 'string' && v.startsWith(CLOSE)) {
    const id = parseId(v.slice(CLOSE.length));
    return id != null && isFilmId(id) ? v : null;
  }
  return parseId(v);
}

export type Game = {
  day: string;
  /** The answer: a show's TheTVDB id, or a film's `m:` key. */
  id: PuzzleId;
  /** Each try, in order: an id as above, or `SKIP`. */
  guesses: PuzzleId[];
  won: boolean;
};

export function newGame(day: string, id: PuzzleId): Game {
  return { day, id, guesses: [], won: false };
}

export function isOver(g: Game): boolean {
  return g.won || g.guesses.length >= MAX_TRIES;
}

/**
 * TWO REMINDERS A DAY, BOOKED A WEEK AHEAD (2.0.3, Mahmood 26 Oct).
 *
 * Before 2.0.3 exactly ONE future reminder was ever pending, re-planned on
 * every launch, so two days without opening the app and it went silent: the
 * one booked notification fired, and nothing was left behind it. Now each day
 * in the window gets a "today's puzzle is ready" at the player's hour and a
 * "last chance" at `PUZZLE_LAST_CHANCE_HOUR`, so a week away still hears from
 * it every day; opening the app, or finishing the game, re-plans from scratch.
 *
 * TODAY is the only day the planner can know about. Once it is played both of
 * today's go (finishing re-plans, so a booked "last chance" is cancelled), and
 * anything already past is skipped. A FUTURE day cannot have been played, and
 * playing it means opening the app, which re-plans; so its pair is booked
 * unconditionally and is never wrong when it fires.
 *
 * THE LAST CHANCE ONLY WHEN IT IS A SECOND, LATER CALL. A chosen hour of 22
 * or 23 would put the "ready" on or after the warning, so from
 * `PUZZLE_LAST_CHANCE_HOUR` on the day has one reminder, the one the player
 * chose; the settings line promising "a last call at 22:00" is then moot,
 * because their own reminder already is one.
 *
 * Budget: 2 × PUZZLE_REMINDER_DAYS = 14 pending, beside the planner's 30
 * episodes and the handful of one-offs, under iOS's 64; the sum is pinned by
 * a test in `puzzle-reminder.test.ts` so raising either side trips it.
 */
export const PUZZLE_REMINDER_DAYS = 7;
export const PUZZLE_LAST_CHANCE_HOUR = 22;

export type PuzzleReminder = { at: number; kind: 'ready' | 'lastChance' };

export function planPuzzleReminders(now: Date, hour: number, playedToday: boolean, days = PUZZLE_REMINDER_DAYS): PuzzleReminder[] {
  const out: PuzzleReminder[] = [];
  const lastChance = hour < PUZZLE_LAST_CHANCE_HOUR;
  for (let d = 0; d < days; d++) {
    if (d === 0 && playedToday) continue;
    // Local wall-clock per day, so a DST change moves nothing off the hour.
    const at = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h).getTime();
    const day: PuzzleReminder[] = [{ at: at(hour), kind: 'ready' }];
    if (lastChance) day.push({ at: at(PUZZLE_LAST_CHANCE_HOUR), kind: 'lastChance' });
    out.push(...day.filter((r) => r.at > now.getTime()));
  }
  return out;
}

/** One try. A finished game ignores further guesses rather than growing.
 *  `close` marks a film of the answer's series (`isClose`); it is ignored on
 *  the answer itself and on anything that is not a film. */
export function guess(g: Game, id: PuzzleId, close = false): Game {
  if (isOver(g)) return g;
  const entry = close && id !== g.id && isFilmId(id) ? CLOSE + id : id;
  return { ...g, guesses: [...g.guesses, entry], won: id === g.id };
}

/**
 * Mark try `i` close after the fact. The guessed film's series may only be
 * known once its details arrive, a moment after the guess was counted — the
 * try was already a miss either way, so only the square changes colour.
 */
export function markClose(g: Game, i: number): Game {
  const id = g.guesses[i];
  if (id == null || id === g.id || isClose(id) || !isFilmId(id)) return g;
  return { ...g, guesses: g.guesses.map((x, j) => (j === i ? CLOSE + id : x)) };
}

/** Wrong tries so far — what decides which clues are showing. */
export function misses(g: Game): number {
  return g.won ? g.guesses.length - 1 : g.guesses.length;
}

/** How many of `CLUES` are revealed: the first is free, one more per miss,
 *  and all of them once the game is over — the reveal is the reward. */
export function cluesShown(g: Game): number {
  return isOver(g) ? CLUES.length : Math.min(misses(g) + 1, CLUES.length);
}

export function blurFor(g: Game): number {
  return isOver(g) ? 0 : BLUR[Math.min(misses(g), BLUR.length - 1)];
}

/** 🟥 wrong, 🟨 right series, 🟩 right, ⬛ skipped — the grid people post. */
export function squares(g: Game): string {
  return g.guesses.map((id) => (id === g.id ? '🟩' : id === SKIP ? '⬛' : isClose(id) ? '🟨' : '🟥')).join('');
}

/**
 * Wordle's text, as people already post it:
 *
 *     OpenTV #12 · 4/6
 *     🟥🟥🟥🟩
 *
 * The same in every language, because every character in it is a number or a
 * square. A loss is X/6, as Wordle writes it. The link goes on at the call
 * site with `withLink`, the way every other share text in the app gets it.
 */
export function shareText(number: number, g: Game): string {
  const score = g.won ? `${g.guesses.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  return `OpenTV #${number} · ${score}\n${squares(g)}`;
}

// ── history: the month of squares ───────────────────────────────────────────

/** `close`: how many tries were the right series (🟨). Absent on every row
 *  written before 14 Oct and on any day without one. `sq` (22 Oct): the grid
 *  itself, one letter per try (`gridCode`), so a past day's result can be
 *  shared square for square; absent on every row written before. */
export type Result = { d: string; id: PuzzleId; tries: number; won: boolean; close?: number; sq?: string };

/** g right, y right series, k skipped, r wrong — `squares` as letters. */
export function gridCode(g: Game): string {
  return g.guesses.map((id) => (id === g.id ? 'g' : id === SKIP ? 'k' : isClose(id) ? 'y' : 'r')).join('');
}

/** Stands in for a wrong guess whose title was never stored: neither SKIP nor
 *  any real id (TheTVDB ids are positive, films are strings). */
const WRONG = -1;

/**
 * A finished day's game rebuilt from its history row, for the result screen's
 * read-only view of a past day (22 Oct). The guesses themselves were never
 * kept — only the grid matters there, and the share text never names a title.
 * With `sq` the grid is exact; without it (rows before 22 Oct), the misses
 * are wrong squares with the `close` ones last, then the solve — a lost game
 * is all misses.
 */
export function gameOfResult(r: Result): Game {
  const tries = Math.min(MAX_TRIES, Math.max(r.won ? 1 : 0, r.tries));
  let code = r.sq;
  if (!code || code.length !== tries || code.indexOf('g') !== (r.won ? tries - 1 : -1)) {
    const missed = r.won ? tries - 1 : tries;
    const close = Math.min(r.close ?? 0, missed);
    code = 'r'.repeat(missed - close) + 'y'.repeat(close) + (r.won ? 'g' : '');
  }
  const guesses = [...code].map((c): PuzzleId => (c === 'g' ? r.id : c === 'k' ? SKIP : c === 'y' ? `${CLOSE}m:?` : WRONG));
  return { day: r.d, id: r.id, guesses, won: r.won };
}

/**
 * Ten years of days, about 50 bytes each.
 *
 * It was 400 while all it fed was a month of squares and the picker's last
 * sixty. "Played" is now counted from it, and a cap of 400 would have frozen
 * that number at 400 after thirteen months — a stat that stops counting is a
 * lie that looks like a plateau.
 */
export const HISTORY_MAX = 3650;

export function resultOf(g: Game): Result {
  const close = g.guesses.filter(isClose).length;
  return { d: g.day, id: g.id, tries: g.guesses.length, won: g.won, ...(close ? { close } : {}), sq: gridCode(g) };
}

/** One row per day, newest last. A day replayed (it cannot be, but a bad
 *  write must not double it) replaces its row. */
export function withResult(history: readonly Result[], r: Result): Result[] {
  return [...history.filter((h) => h.d !== r.d), r].sort((a, b) => a.d.localeCompare(b.d)).slice(-HISTORY_MAX);
}

/**
 * How strongly a day's square is coloured: 6 for a first-try win down to 1 for
 * a sixth-try one, 0 for a loss. The block mixes the green by this, so "dark
 * green = first try … grey = lost" is one number, not six colours.
 *
 * -1 (14 Oct) is a loss that found the right series — the block draws it
 * yellow. A build before then clamps it to 0 and draws a plain loss, which is
 * what it was to that build.
 */
export const CLOSE_LEVEL = -1;

export function winLevel(r: Result): number {
  if (r.won) return Math.max(1, MAX_TRIES + 1 - r.tries);
  return r.close ? CLOSE_LEVEL : 0;
}

// ── the stats ───────────────────────────────────────────────────────────────

/**
 * Wordle's three numbers, in place of the streak.
 *
 * `avg` is the average tries of the WINS, as Wordle's "average guesses" is: a
 * loss has no try count worth averaging — it is six misses, and folding it in
 * would make a player who never gives up look worse than one who never plays.
 * Null with no win yet, which the block draws as a dash rather than "0".
 * A 🟨 is a try like any other: "right series" is a kinder miss, not a
 * cheaper one, so a win after one counts it in full.
 */
export type Stats = { played: number; win: number; avg: number | null };

export function puzzleStats(history: readonly Result[]): Stats {
  const wins = history.filter((r) => r.won);
  const played = history.length;
  return {
    played,
    win: played ? Math.round((100 * wins.length) / played) : 0,
    avg: wins.length ? Math.round((10 * wins.reduce((n, r) => n + r.tries, 0)) / wins.length) / 10 : null,
  };
}

/**
 * Consecutive days played, today's games only (the archive is replaying, not
 * playing — it never fills a gap). Counted back from today if today is
 * played, else from yesterday: today not played YET does not break
 * yesterday's run, a whole missed day does. A loss counts as played.
 *
 * Counted from the per-day history, never stored: the 10 Oct build kept a
 * `puzzle.streak` meta, which is ignored, so a counter that drifted then
 * cannot drift now.
 */
export function puzzleStreak(history: readonly Result[], today: string): number {
  const days = new Set(history.map((r) => r.d));
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

/** The longest run of consecutive days ever played — same rules as
 *  `puzzleStreak` (today's games only, a loss counts), but anywhere in the
 *  history. Never less than the current streak. */
export function longestStreak(history: readonly Result[]): number {
  const days = [...new Set(history.map((r) => r.d))].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The first day of the current streak, or null when there is none. */
export function streakStart(history: readonly Result[], today: string): string | null {
  const n = puzzleStreak(history, today);
  if (!n) return null;
  const end = history.some((r) => r.d === today) ? today : shiftDay(today, -1);
  return shiftDay(end, -(n - 1));
}

/** Whole hours, rounded UP, until the phone's own midnight — "1h left" at
 *  23:30, never "0h". The Date constructor carries the DST change. */
export function hoursLeftToday(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 3_600_000));
}

/**
 * Today's picture on the Explore card and the profile block (22 Oct): sharp,
 * with the title, once today is played; before that at the game's own first
 * blur, a teaser that gives nothing away. Null with no picture pinned yet
 * (the game was never opened today, or offline): the card keeps its old look.
 */
export type PuzzleArt = { uri: string; blur: number; title: string | null };

export function puzzleArt(pic: string | null | undefined, played: boolean, title: string | null): PuzzleArt | null {
  if (!pic) return null;
  return { uri: pic, blur: played ? 0 : BLUR[0], title: played ? title : null };
}

/** A free player sees the titles of the last week of history; the rest is Plus. */
export const FREE_HISTORY_DAYS = 7;

export function historyUnlocked(day: string, today: string, plus: boolean): boolean {
  return plus || daysBetween(day, today) < FREE_HISTORY_DAYS;
}

/**
 * What the Profile tab's daily-puzzle banner says, or null for no banner.
 * Off when the game is off, once today is played, and for the rest of the day
 * once its ✕ was pressed (`closedOn` is the day stamp it was pressed on).
 * `streak` is what tapping in keeps — 0 when there is nothing to keep.
 */
export function puzzleBanner(s: {
  on: boolean;
  today: string;
  history: readonly Result[];
  closedOn: string | null;
}): { streak: number } | null {
  if (!s.on || s.closedOn === s.today || s.history.some((r) => r.d === s.today)) return null;
  return { streak: puzzleStreak(s.history, s.today) };
}

/**
 * THE FIRST OPEN GOES THROUGH THE INTRO (22 Oct): what the game is, and the
 * two opt-ins (streak on the profile, daily reminder), asked once. Stamped by
 * the intro's one button (`remindOffered`, the key the old first-open alert
 * used, so anybody who already answered that is not asked again).
 */
export function puzzleIntroDue(s: { on: boolean; offered: boolean }): boolean {
  return s.on && !s.offered;
}

/**
 * The puzzle streak on the owner's OWN profile — opted into on the intro
 * screen or in Settings, and gone with the game when it is switched off.
 * It never travels: `publicPuzzle` carries no streak.
 */
export function puzzleStreakShown(s: { on: boolean; optIn: boolean }): boolean {
  return s.on && s.optIn;
}

/**
 * What the profile block is drawn from, on either phone.
 *
 * COUNTS AND COLOURS ONLY: the three stats, and one level per day played this
 * month. No id and no title — the server never learns which shows anybody
 * guessed — and since 14 Oct no streak either (`n`, which builds before then
 * published, is simply not sent).
 */
export type PublicPuzzle = { days: [string, number][]; stats: Stats | null };

export function publicPuzzle(history: readonly Result[], month: string): PublicPuzzle {
  return {
    days: history.filter((r) => r.d.startsWith(month)).map((r) => [r.d, winLevel(r)]),
    stats: puzzleStats(history),
  };
}

/** A published value from somebody else's phone — tolerant, like
 *  `parsePublished`: a shape this build does not recognise draws nothing.
 *  A value from a build before 14 Oct carries a streak and no stats; the
 *  streak is ignored and the stats row is left off. */
export function parsePublicPuzzle(v: unknown): PublicPuzzle | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as { days?: unknown; stats?: unknown };
  const days: [string, number][] = [];
  if (Array.isArray(o.days)) {
    for (const item of o.days) {
      if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'number') continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item[0])) continue;
      days.push([item[0], Math.min(MAX_TRIES, Math.max(CLOSE_LEVEL, Math.floor(item[1])))]);
    }
  }
  const st = o.stats as Partial<Record<keyof Stats, unknown>> | null | undefined;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const played = num(st?.played);
  const stats =
    played == null
      ? null
      : {
          played: Math.max(0, Math.floor(played)),
          win: Math.min(100, Math.max(0, Math.round(num(st?.win) ?? 0))),
          avg: num(st?.avg) == null ? null : Math.min(MAX_TRIES, Math.max(1, num(st?.avg)!)),
        };
  return { days, stats };
}

// ── saves from either era ───────────────────────────────────────────────────

/**
 * Today's saved game, as `puzzle.game` holds it, or null — yesterday's is not
 * resumed, and neither is a shape this build cannot read. A game saved before
 * films (every id a number) passes unchanged: see `PuzzleId`.
 */
export function parseGame(v: unknown, day: string): Game | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Partial<Record<keyof Game, unknown>>;
  const id = parseId(o.id);
  if (o.day !== day || id == null || !Array.isArray(o.guesses)) return null;
  const guesses = o.guesses.map(parseGuess);
  if (guesses.some((x) => x == null)) return null;
  return { day, id, guesses: guesses as PuzzleId[], won: o.won === true };
}

/** The history, rows from either era; a row this build cannot read is dropped
 *  rather than taking the whole month with it. */
export function parseHistory(v: unknown): Result[] {
  if (!Array.isArray(v)) return [];
  const out: Result[] = [];
  for (const r of v) {
    if (typeof r !== 'object' || r === null) continue;
    const o = r as Partial<Record<keyof Result, unknown>>;
    const id = parseId(o.id);
    if (typeof o.d !== 'string' || id == null) continue;
    const close = typeof o.close === 'number' && o.close > 0 ? Math.floor(o.close) : 0;
    const sq = typeof o.sq === 'string' && /^[gykr]{1,6}$/.test(o.sq) ? o.sq : null;
    out.push({ d: o.d, id, tries: typeof o.tries === 'number' ? o.tries : 0, won: o.won === true, ...(close ? { close } : {}), ...(sq ? { sq } : {}) });
  }
  return out;
}

// ── the clues ───────────────────────────────────────────────────────────────

/**
 * What the phone knows about today's answer, gathered by `puzzle-data.ts`.
 * Any field may be null; the kind never is.
 */
export type Clues = {
  kind: 'show' | 'film';
  year: string | null;
  genre: string | null;
  /** Shows. */
  network: string | null;
  seasons: number | null;
  /** Films. */
  director: string | null;
  runtime: number | null;
  actor: string | null;
  character: string | null;
};

/** One translatable piece of a clue row: a key and its values. */
export type CluePart = [key: LocaleKey, params?: Record<string, string | number>];

/**
 * The pieces of one clue row, which the screen translates and joins with " · ".
 *
 * WHAT EXISTS, AND NOTHING INVENTED: a film with no director cached says its
 * runtime alone, and a row with nothing at all comes back EMPTY — the screen
 * then says "nothing known here", exactly as a show missing its network
 * always has. The kind row is never empty: the kind is always known.
 */
export function clueParts(clue: Clue, c: Clues): CluePart[] {
  const film = c.kind === 'film';
  const parts: (CluePart | null)[] = [];
  switch (clue) {
    case 'kindYear':
      parts.push(
        [film ? 'puzzleTitles.kindFilm' : 'puzzleTitles.kindShow'],
        c.year ? [film ? 'puzzleTitles.released' : 'puzzle.clueYear', { year: c.year }] : null,
      );
      break;
    case 'genre':
      parts.push(c.genre ? ['puzzle.clueGenre', { genre: c.genre }] : null);
      break;
    case 'details':
      if (film) {
        parts.push(
          c.director ? ['puzzleTitles.director', { name: c.director }] : null,
          c.runtime ? ['puzzleTitles.runtime', { count: c.runtime }] : null,
        );
      } else {
        parts.push(
          c.network ? ['puzzle.clueNetwork', { network: c.network }] : null,
          c.seasons ? ['show.seasonsCount', { count: c.seasons }] : null,
        );
      }
      break;
    case 'actor':
      parts.push(c.actor ? ['puzzleTitles.actor', { name: c.actor }] : null);
      break;
    case 'character':
      parts.push(c.character ? ['puzzle.clueCharacter', { name: c.character }] : null);
      break;
    default:
      break;
  }
  return parts.filter((p): p is CluePart => p != null);
}

/** Case-insensitive, diacritic-insensitive "does this title match what was
 *  typed", so "la casa de papel" finds "La Casa de Papel" and "pokemon" finds
 *  "Pokémon". Nothing cleverer: the list is one library, not a search engine. */
export function titleMatches(name: string, query: string): boolean {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const q = fold(query.trim());
  return q.length > 0 && fold(name).includes(q);
}
