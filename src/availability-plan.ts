/**
 * "Tell me when it's on my services" (2.0.0, PLUS) — the rules, with no I/O.
 *
 * Split out for the same reason `notification-plan.ts` is: the fetches are
 * mechanical, and "is this new", "is this one of theirs", "which forty do we
 * ask about today" is where a wrong answer either spams somebody or never
 * tells them anything. Those get tests; `availability.ts` does the asking.
 */
import type { WatchKind } from '@/pure';

/**
 * Ways of watching that are "on" a service: included in the subscription,
 * free, or free with adverts. A film you can rent on Apple TV is not on Apple
 * TV+, and telling somebody it "arrived" would be a lie with a price tag.
 * No kind at all is a provider cached before kinds were kept, when only the
 * subscription list was read — so it counts.
 */
const INCLUDED: ReadonlySet<WatchKind | undefined> = new Set<WatchKind | undefined>(['flatrate', 'free', 'ads', undefined]);

/**
 * One service, however TMDB spells it this week.
 *
 * TMDB lists "Netflix" and "Netflix basic with Ads", "Amazon Prime Video" and
 * "Amazon Prime Video with Ads", as different providers. To a subscriber they
 * are one service, and picking Netflix has to match both.
 */
export function serviceKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+(basic|standard)?\s*with\s+ads$/, '')
    .replace(/\s+/g, ' ');
}

/** The included services on one title, display names, one per service. */
export function includedServices(providers: readonly { name: string | null; kind?: WatchKind }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of providers) {
    const name = (p.name ?? '').trim();
    if (!name || !INCLUDED.has(p.kind)) continue;
    const key = serviceKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** The user's services (as THEY named them) that this title is on. */
export function onMyServices(titleServices: readonly string[], mine: readonly string[]): string[] {
  const here = new Set(titleServices.map(serviceKey));
  return mine.filter((m) => here.has(serviceKey(m)));
}

/**
 * The user's services this title has JUST arrived on — the notification.
 *
 * `prev` null means this title has never been looked at (or was last looked at
 * for another country): that check is the BASELINE and says nothing, or the
 * first run after turning this on would announce the whole watchlist as "now
 * on Netflix" when most of it always was.
 *
 * `notified` is every service already announced for this title, ever. A film
 * that leaves Netflix and comes back is not news twice.
 */
export function newlyOnMyServices(
  prev: readonly string[] | null,
  current: readonly string[],
  mine: readonly string[],
  notified: readonly string[],
): string[] {
  if (prev == null) return [];
  const before = new Set(prev.map(serviceKey));
  const told = new Set(notified.map(serviceKey));
  return onMyServices(current, mine).filter((s) => !before.has(serviceKey(s)) && !told.has(serviceKey(s)));
}

/** Requests per run, and how often one title may be asked about. */
export const CHECK_CAP = 40;
export const TITLE_GAP_MS = 24 * 3600000;

/**
 * Which titles to ask about this run: never asked first, then the longest
 * ago, none asked within the last day, at most `cap`. A big watchlist is
 * therefore walked round in turn — 400 films at 40 a run is every one of them
 * within ten runs — and a small one costs a handful of requests a day.
 */
export function pickTitlesToCheck<T extends { checkedAt: number | null }>(
  candidates: readonly T[],
  now: number,
  cap = CHECK_CAP,
  gapMs = TITLE_GAP_MS,
): T[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.checkedAt == null || c.checkedAt > now || now - c.checkedAt >= gapMs)
    .sort((a, b) => (a.c.checkedAt ?? -1) - (b.c.checkedAt ?? -1) || a.i - b.i)
    .slice(0, cap)
    .map(({ c }) => c);
}

/** Stored JSON → a list of names; anything else is empty. */
export function parseNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** A region's provider catalogue (TMDB `/watch/providers/{movie,tv}`), merged
 *  and in the order TMDB ranks them for that country, one row per service. */
export function regionCatalogue(
  lists: readonly (readonly { provider_name?: string; display_priorities?: Record<string, number>; display_priority?: number }[])[],
  region: string,
): string[] {
  const best = new Map<string, { name: string; rank: number }>();
  for (const list of lists) {
    for (const p of list) {
      const name = (p.provider_name ?? '').trim();
      if (!name) continue;
      const rank = p.display_priorities?.[region] ?? p.display_priority ?? 999;
      const key = serviceKey(name);
      const had = best.get(key);
      // the shorter name is the plain service, not its "with Ads" tier
      if (!had) best.set(key, { name, rank });
      else best.set(key, { name: name.length < had.name.length ? name : had.name, rank: Math.min(rank, had.rank) });
    }
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((x) => x.name);
}
