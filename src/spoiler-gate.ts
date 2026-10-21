/**
 * THE SPOILER QUESTION FOR AN EPISODE'S COMMENTS (2.0.0).
 *
 * Films asked "Spoilers ahead!" before showing the comments of one you have
 * not watched; episodes went straight in. This is the episode half of it, as a
 * decision with no React and no database, so it can be tested.
 *
 * Only an EPISODE thread is gated: a show-level thread is about the whole
 * series and a film's own pill already asks. "Watched" is this phone's
 * `watches` table, asked through `isWatched`. "Display anyway" is remembered
 * for the rest of the session, the way the film's question is asked again on
 * each visit but not twice in one sitting.
 */
import type { ThreadTarget } from '@/community-comments';

// ponytail: session memory only; persist to meta if people ask to be asked less.
const revealed = new Set<string>();

/** "showId-season-episode" for an episode thread, null for anything else. */
export function episodeGateKey(t: ThreadTarget): string | null {
  if (t.source !== 'tvdb' || t.season == null || t.episode == null) return null;
  const show = Number(t.key);
  return Number.isInteger(show) && show > 0 ? `${show}-${t.season}-${t.episode}` : null;
}

/**
 * Whether `target`'s comments wait behind the question. `shown` is the key the
 * calling screen has just revealed — passed IN rather than read from the set,
 * so the React Compiler sees the argument change and re-runs this.
 */
export function episodeGated(
  target: ThreadTarget,
  isWatched: (show: number, season: number, episode: number) => boolean,
  shown: string | null,
): boolean {
  const key = episodeGateKey(target);
  if (key == null || key === shown || revealed.has(key)) return false;
  return !isWatched(Number(target.key), target.season as number, target.episode as number);
}

/** "Display anyway": this episode stays open until the app is closed. */
export function revealEpisode(target: ThreadTarget): string | null {
  const key = episodeGateKey(target);
  if (key != null) revealed.add(key);
  return key;
}
