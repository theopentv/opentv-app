/**
 * Private notes — the half a test can reach. Storage is in `db.ts`
 * (`show_notes`, `movie_notes`); this file holds only the rules.
 */

/**
 * Long enough for a paragraph about why a finale hurt, short enough that a
 * paste of something enormous cannot bloat every backup ZIP from then on.
 */
export const NOTE_MAX_LENGTH = 2000;

/** What actually gets stored: trimmed, capped, and null when nothing is left —
 *  an emptied note is a deleted note, not a blank row. */
export function cleanNote(text: string | null | undefined): string | null {
  const s = (text ?? '').trim().slice(0, NOTE_MAX_LENGTH).trim();
  return s.length > 0 ? s : null;
}

export type SidecarShowNote = { showId: number; season: number; episode: number; text: string; updatedAt: string };
export type SidecarMovieNote = { movie: string; text: string; updatedAt: string };
export type SidecarNotes = { shows: SidecarShowNote[]; movies: SidecarMovieNote[] };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * The `notes` key of `_opentv_extras.json`, checked row by row.
 *
 * A backup is a file the user can hand-edit or that another tool may have
 * written, so nothing in it is trusted: a row with the wrong shape is skipped,
 * never allowed to fail the restore it rides in. A missing date becomes
 * `fallbackDate` (the import's clock), so the column stays NOT NULL.
 */
export function notesFromSidecar(raw: unknown, fallbackDate: string): SidecarNotes {
  const out: SidecarNotes = { shows: [], movies: [] };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { shows?: unknown; movies?: unknown };
  const date = (v: unknown) => (typeof v === 'string' && v ? v : fallbackDate);
  for (const n of Array.isArray(r.shows) ? r.shows : []) {
    const x = (n ?? {}) as Partial<Record<keyof SidecarShowNote, unknown>>;
    const text = cleanNote(typeof x.text === 'string' ? x.text : null);
    if (!text || !isInt(x.showId) || x.showId <= 0 || !isInt(x.season) || !isInt(x.episode)) continue;
    out.shows.push({ showId: x.showId, season: x.season, episode: x.episode, text, updatedAt: date(x.updatedAt) });
  }
  for (const n of Array.isArray(r.movies) ? r.movies : []) {
    const x = (n ?? {}) as Partial<Record<keyof SidecarMovieNote, unknown>>;
    const text = cleanNote(typeof x.text === 'string' ? x.text : null);
    if (!text || typeof x.movie !== 'string' || !x.movie) continue;
    out.movies.push({ movie: x.movie, text, updatedAt: date(x.updatedAt) });
  }
  return out;
}
