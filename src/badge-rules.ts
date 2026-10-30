/**
 * What a TV Time badge id means, without the phone around it. TV Time's export
 * lists only ids and dates (`121361-marathoner-5-within-24-bd`), with the show's
 * TheTVDB id in front where there is one. Nothing here is computed from a watch:
 * an earned badge came from TV Time and is kept as earned.
 */
export type StoredBadge = { id: string; date: string };

export type BadgeGroup = 'app' | 'watch' | 'ratings';

export type BadgeInfo = {
  id: string;
  group: BadgeGroup;
  kind: 'marathoner' | 'quick' | 'serial' | 'voter' | 'emoter' | 'quizzer' | 'showoff' | 'app';
  /** A TheTVDB id, when the id starts with one. */
  showId: number | null;
  /** A show's name, for a marathon counted on this phone. */
  showName: string | null;
  count: number;
  hours: number;
  year: string | null;
  /** The canonical app badge, when there is one. */
  app: AppBadgeId | null;
};

/** TV Time's fourteen, in its order, with the names it drew on them. */
export const APP_BADGES = [
  ['voted-character', 'Jury'],
  ['got-comment-like', 'Hipster'],
  ['commented-episode', 'Author'],
  ['created-meme', 'Meme'],
  ['gave-comment-like', 'Supporter'],
  ['chose-emotion', 'Emo'],
  ['used-mobile-version', 'Nomad'],
  ['checked-user-profile', 'Stalker'],
  ['displayed-comments', 'Fearless'],
  ['cleared-watchlist', 'Mr Clean'],
  ['reported-spoiler', 'Patrol'],
  ['used-web-version', 'Surfer'],
  ['commented-show', 'Socializer'],
  ['archived-show', 'Archivist'],
] as const;

export type AppBadgeId = (typeof APP_BADGES)[number][0];

/** The export's names for two of them differ from the screen's. */
const APP_ALIAS: Record<string, AppBadgeId> = {
  'viewed-profile': 'checked-user-profile',
  'displayed-hidden': 'displayed-comments',
  'reported-comment': 'reported-spoiler',
};

const isApp = (id: string): id is AppBadgeId => APP_BADGES.some(([a]) => a === id);

function who(prefix: string | undefined): Pick<BadgeInfo, 'showId' | 'showName'> {
  if (!prefix) return { showId: null, showName: null };
  return /^\d+$/.test(prefix) ? { showId: Number(prefix), showName: null } : { showId: null, showName: prefix };
}

/** Null for an id this build does not know, which is kept but not drawn. */
export function parseBadge(raw: string): BadgeInfo | null {
  const id = raw.trim();
  const base = { id, showId: null, showName: null, count: 0, hours: 0, year: null, app: null };
  const alias = APP_ALIAS[id] ?? id;
  if (isApp(alias)) return { ...base, group: 'app', kind: 'app', app: alias };
  let m = /^(.+)-marathoner-(\d+)-within-(\d+)/.exec(id);
  if (m) return { ...base, ...who(m[1]), group: 'watch', kind: 'marathoner', count: +m[2], hours: +m[3] };
  m = /^(?:(.+)-)?quick-watcher-(\d+)/.exec(id);
  if (m) return { ...base, ...who(m[1]), group: 'watch', kind: 'quick', count: +m[2] };
  m = /^(?:(.+)-)?serial-watcher-(\d+)/.exec(id);
  if (m) return { ...base, ...who(m[1]), group: 'watch', kind: 'serial', count: +m[2] };
  m = /^(?:(.+)-)?serial-actor-voter-(\d+)/.exec(id);
  if (m) return { ...base, ...who(m[1]), group: 'ratings', kind: 'voter', count: +m[2] };
  m = /^(?:(.+)-)?serial-emotioner-(\d+)/.exec(id);
  if (m) return { ...base, ...who(m[1]), group: 'ratings', kind: 'emoter', count: +m[2] };
  m = /^quizzer-(\d+)/.exec(id);
  if (m) return { ...base, group: 'app', kind: 'quizzer', count: +m[1] };
  m = /^show-off-(\d+)/.exec(id);
  if (m) return { ...base, group: 'app', kind: 'showoff', year: m[1] };
  return null;
}

/** The rows of `user_badge.csv`, folded into what is already kept. Ids are
 *  padded with spaces in some exports, so they are trimmed; an earned badge is
 *  never lost, and the earliest date wins. */
export function mergeBadges(
  have: readonly StoredBadge[],
  rows: readonly { badge_id?: string; created_at?: string }[],
): StoredBadge[] {
  const by = new Map(have.map((b) => [b.id, b]));
  for (const r of rows) {
    const id = r.badge_id?.trim();
    if (!id) continue;
    const date = (r.created_at ?? '').slice(0, 10);
    const old = by.get(id);
    if (!old || (date !== '' && (old.date === '' || date < old.date))) by.set(id, { id, date });
  }
  return [...by.values()];
}
