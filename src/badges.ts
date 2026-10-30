/**
 * The badges in a library: the ones TV Time awarded, kept from the export, and
 * the few this phone can see for itself. The rules live in `badge-rules.ts`.
 */
import { APP_BADGES, type AppBadgeId, type BadgeInfo, mergeBadges, parseBadge, type StoredBadge } from '@/badge-rules';
import db, { getMeta, setMeta } from '@/db';
import { showMeta } from '@/metadata';

export const BADGES_KEY = 'tvtimeBadges';

export function storedBadges(): StoredBadge[] {
  try {
    return JSON.parse(getMeta(BADGES_KEY) ?? '[]') as StoredBadge[];
  } catch {
    return [];
  }
}

/** Folded in, not replaced, so a re-import or a second export only ever adds. */
export function saveBadgeRows(rows: readonly { badge_id?: string; created_at?: string }[]): void {
  if (rows.length) setMeta(BADGES_KEY, JSON.stringify(mergeBadges(storedBadges(), rows)));
}

const any = (sql: string): boolean => {
  try {
    return db.getFirstSync(sql) != null;
  } catch {
    return false;
  }
};

/** App badges this library proves by itself, for anybody with no TV Time past. */
function earnedHere(): Set<AppBadgeId> {
  const out = new Set<AppBadgeId>(['used-mobile-version']);
  if (any('SELECT 1 FROM character_votes LIMIT 1')) out.add('voted-character');
  if (any('SELECT 1 FROM episode_emotions LIMIT 1')) out.add('chose-emotion');
  if (any("SELECT 1 FROM comments WHERE type = 'episode' LIMIT 1")) out.add('commented-episode');
  if (any("SELECT 1 FROM comments WHERE type = 'show' LIMIT 1")) out.add('commented-show');
  if (any('SELECT 1 FROM shows WHERE archived = 1 LIMIT 1')) out.add('archived-show');
  return out;
}

export type Badge = BadgeInfo & { date: string; name: string | null; art: string | null };

function toBadge(info: BadgeInfo, date: string): Badge {
  const row =
    info.showId != null
      ? db.getFirstSync<{ name: string; posterUrl: string | null }>('SELECT name, posterUrl FROM shows WHERE tvdbId = ?', [info.showId])
      : info.showName != null
        ? db.getFirstSync<{ name: string; posterUrl: string | null }>('SELECT name, posterUrl FROM shows WHERE name = ?', [info.showName])
        : null;
  const m = info.showId != null ? showMeta(info.showId) : null;
  return { ...info, date, name: row?.name ?? m?.name ?? info.showName, art: m?.poster ?? row?.posterUrl ?? null };
}

/** One badge by its id, for the detail page. */
export function badgeById(id: string): Badge | null {
  const info = parseBadge(id);
  if (!info) return null;
  const stored = storedBadges().find((b) => {
    const p = parseBadge(b.id);
    return b.id === id || (info.app != null && p?.app === info.app);
  });
  return toBadge(info, stored?.date ?? '');
}

export type BadgeShelves = {
  /** Every app badge, earned or not, in TV Time's order. */
  app: { id: AppBadgeId; name: string; earned: boolean }[];
  /** Quizzer, Show-off: earned only, and TV Time's alone. */
  extra: Badge[];
  watch: Badge[];
  ratings: Badge[];
};

/** `marathons` are the ones `computeShowStats` counted on this phone. */
export function badgeShelves(marathons: readonly { show: string; count: number; hours: number }[]): BadgeShelves {
  const parsed = storedBadges().flatMap((b) => {
    const info = parseBadge(b.id);
    return info ? [toBadge(info, b.date)] : [];
  });
  const newest = (a: Badge, b: Badge) => b.date.localeCompare(a.date);
  const earned = earnedHere();
  for (const b of parsed) if (b.app) earned.add(b.app);
  // COUNTED HERE ONLY WITH NO TV TIME BADGES. An import stamps bulk-marked
  // episodes with one moment, so a real export's 99 watch badges became 1,385
  // "marathons" that nobody ran. TV Time's list is the true one when it exists.
  const watched = parsed.filter((b) => b.group === 'watch');
  const counted = (watched.length > 0 ? [] : marathons)
    .flatMap((m) => {
      const info = parseBadge(`${m.show}-marathoner-${m.count}-within-${m.hours}-bd`);
      return info ? [toBadge(info, '')] : [];
    });
  return {
    app: APP_BADGES.map(([id, name]) => ({ id, name, earned: earned.has(id) })),
    extra: parsed.filter((b) => b.kind === 'quizzer' || b.kind === 'showoff').sort(newest),
    watch: [...watched, ...counted].sort(newest),
    ratings: parsed.filter((b) => b.group === 'ratings').sort(newest),
  };
}
