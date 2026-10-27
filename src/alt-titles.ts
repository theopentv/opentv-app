/**
 * The other names a film is known by, so searching for it works.
 *
 * WHY THIS EXISTS. A library imported from TV Time carries whatever title that
 * export happened to hold, which is often not English: one film in a real
 * library is stored as "La Tortue rouge", so searching "The Red Turtle" — in the
 * app or out loud to Siri — finds nothing at all. The library is not wrong; it
 * simply knows one of the film's names, and the person asking knows a different
 * one.
 *
 * WHAT IS FETCHED, AND WHAT IS NOT. TMDB's `alternative_titles` returns dozens
 * of rows per film, one per country, most of them noise. This asks for the film
 * twice instead — once in English, once in the reader's own language — and keeps
 * the original title alongside. Three names cover the case that actually
 * happens: the library holds one language and the person speaks another.
 *
 * ONE PASS, THEN NEVER AGAIN. A film's other names do not change, so a row is
 * fetched once and remembered, and a film that returns nothing is marked so the
 * next launch does not ask a second time. That marker is what keeps this from
 * becoming a request per film per launch, for ever.
 */
import * as Localization from 'expo-localization';

import db, { getMeta, setMeta } from '@/db';
import { currentLocale } from '@/i18n';
import { pool, tmdb } from '@/tmdb';
import { tvdbKeyFailed, tvdbMovieExtended } from '@/tvdb';
import { type AltTitles, parseAltTitles, TVDB_LANG } from '@/pure';

/** The column holds a JSON object of names. `{}` means "asked, none". */
type Row = { name: string; tmdbId: number | null; tvdbId: number | null };

/**
 * How many films to resolve per launch.
 *
 * FORTY WAS TOO FEW TO BE USEFUL. The order is unwatched-first and then
 * alphabetical, so a watchlist of a hundred and forty-three meant everything
 * past the letter C waited for tomorrow — and the two films actually being
 * asked about, "La Tortue rouge" and a Spider-Man, sat at L and S. A user
 * cannot tell "not fetched yet" from "broken", and reasonably called it broken.
 *
 * Two hundred covers a normal watchlist in one launch. The work is pooled four
 * at a time behind the launch, costs at most two small requests per film, and
 * happens once per film for ever.
 */
const BATCH = 200;

/**
 * Which films still need their names.
 *
 * THREE HOLES, found 27 Oct 2026 when Wolf Children went on showing as
 * おおかみこどもの雨と雪 for an English reader:
 *
 *   - `tmdbId = 0` is the "matched on TheTVDB" sentinel (see `setMovieMatchTvdb`),
 *     and `IS NOT NULL` let it through: every such film asked TMDB for
 *     `/movie/0` on every launch, failed, wrote nothing, and asked again the next.
 *     Those films now ask TheTVDB, the source that actually matched them.
 *   - a film with only a TheTVDB id was never asked at all.
 *   - the first version stored an unlabelled array, which `parseAltTitles` reads
 *     as naming nothing. Those rows were "done" and could never be displayed;
 *     they are asked once more and rewritten in the named shape.
 */
function pending(): Row[] {
  try {
    return db.getAllSync<Row>(
      `SELECT name, tmdbId, tvdbId FROM movies
        WHERE (tmdbId > 0 OR tvdbId > 0)
          AND (altTitles IS NULL OR altTitles = '' OR altTitles LIKE '[%')
        ORDER BY (watchedAt IS NULL) DESC, name
        LIMIT ?`,
      [BATCH],
    );
  } catch {
    return [];
  }
}

/**
 * Ask TMDB what else this film is called.
 *
 * TWO REQUESTS, NOT THE ALTERNATIVE-TITLES ENDPOINT: the film in English and
 * the film in the reader's language. `original_title` comes free with either,
 * and so does `original_language`, which is what tells a real translation from
 * TMDB handing back the original for want of one (see `displayTitle`).
 */
async function namesFor(tmdbId: number, locale: string): Promise<AltTitles> {
  const out: AltTitles = {};
  const english = await tmdb<{ title?: string; original_title?: string; original_language?: string }>(
    `/movie/${tmdbId}?language=en-US`,
  );
  if (english.title) out.en = english.title;
  if (english.original_title) out.orig = english.original_title;
  if (english.original_language) out.ol = english.original_language;

  // Only when the reader is not already reading English, so the common case
  // costs one request rather than two.
  if (!locale.toLowerCase().startsWith('en')) {
    try {
      const mine = await tmdb<{ title?: string }>(`/movie/${tmdbId}?language=${encodeURIComponent(locale)}`);
      if (mine.title) {
        out.loc = mine.title;
        out.lang = locale;
      }
    } catch {
      // A locale TMDB does not serve is not a failure; the English pass stands.
    }
  }
  return out;
}

/**
 * The same names from TheTVDB, for a film matched there and not on TMDB.
 *
 * ONE REQUEST: the extended record with `meta=translations` carries every
 * language's name. TheTVDB lists only real translations — no fallback to the
 * original — so whatever it gives for the reader's language is theirs.
 * Throws when the record cannot be had, so nothing is written and the next
 * launch asks again.
 */
async function tvdbNamesFor(tvdbId: number, locale: string): Promise<AltTitles> {
  const d = await tvdbMovieExtended(tvdbId, true);
  if (!d) throw new Error('unreachable');
  const names = d.translations?.nameTranslations ?? [];
  const nameIn = (code: string | undefined): string | undefined =>
    code ? (names.find((n) => n.language === code && !n.isAlias && n.name)?.name ?? undefined) : undefined;
  const out: AltTitles = {};
  const en = nameIn('eng');
  if (en) out.en = en;
  const code = TVDB_LANG[locale.slice(0, 2).toLowerCase()];
  const loc = code && code !== 'eng' ? nameIn(code) : undefined;
  if (loc) {
    out.loc = loc;
    out.lang = locale;
  }
  return out;
}

/**
 * Rows fetched before 2.0.3 hold a localised name with no note of its
 * language, so `displayTitle` would never show it. They were asked in the
 * phone's language — that is what the old code sent — so that is written in,
 * once, locally. Re-fetching instead would be a request per film on the first
 * launch of the update for every non-English reader.
 */
function backfillLang(): void {
  if (getMeta('altTitlesLang')) return;
  try {
    const device = Localization.getLocales()[0]?.languageTag ?? 'en-US';
    const rows = db.getAllSync<{ name: string; altTitles: string }>(
      `SELECT name, altTitles FROM movies WHERE altTitles LIKE '{%"loc"%'`,
    );
    db.withTransactionSync(() => {
      for (const r of rows) {
        const t = parseAltTitles(r.altTitles);
        if (t.loc && !t.lang) {
          db.runSync('UPDATE movies SET altTitles = ? WHERE name = ?', [JSON.stringify({ ...t, lang: device }), r.name]);
        }
      }
    });
    setMeta('altTitlesLang', '1');
  } catch {
    // tried again next launch
  }
}

/**
 * Fill in what is missing, a batch at a time.
 *
 * Runs behind the same background work as the other metadata passes and is
 * safe to call on every launch: it stops immediately once every film with an
 * id has been asked about.
 *
 * In the APP's language, not the phone's: that is the language `displayTitle`
 * compares against.
 */
export async function fillAltTitles(): Promise<void> {
  backfillLang();
  const rows = pending();
  if (!rows.length) return;

  const locale = currentLocale();
  const tvdbUsable = !tvdbKeyFailed();
  await pool(
    rows,
    async (row) => {
      const viaTmdb = row.tmdbId != null && row.tmdbId > 0;
      if (!viaTmdb && !tvdbUsable) return;
      // Asked before and answered nothing: never ask again.
      if (viaTmdb && getMeta(`altTitlesMiss:${row.tmdbId}`)) return;
      try {
        const names = viaTmdb ? await namesFor(row.tmdbId!, locale) : await tvdbNamesFor(row.tvdbId!, locale);
        db.runSync('UPDATE movies SET altTitles = ? WHERE name = ?', [JSON.stringify(names), row.name]);
        // Nothing that differs from the stored name is nothing worth asking
        // about again.
        const useful = [names.en, names.orig, names.loc].filter((n) => n && n !== row.name);
        if (viaTmdb && !useful.length) setMeta(`altTitlesMiss:${row.tmdbId}`, '1');
      } catch {
        // Offline, rate-limited, or a dead id. No marker is written, so the
        // next launch tries again — right for a transient failure and harmless
        // for a permanent one, because the batch is small.
      }
    },
    4,
  );
}


/** Every name a film answers to, for searching. Never throws. */
export function altTitlesOf(movieName: string): string[] {
  try {
    const row = db.getFirstSync<{ altTitles: string | null }>(
      'SELECT altTitles FROM movies WHERE name = ?',
      [movieName],
    );
    const t = parseAltTitles(row?.altTitles);
    return [t.en, t.orig, t.loc].filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

/* Re-exported: these moved to `pure.ts` so they can be unit-tested without
   dragging SQLite in, and every existing caller keeps its import path. */
export { parseAltTitles, type AltTitles };
