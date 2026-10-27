/**
 * The free month of Plus (2.0.3) — the decisions, without the phone around
 * them, so the Node runner can pin them. `free-month.ts` does the rest.
 */

/** Days before the month ends that the first reminder fires: day 25 of 30. */
export const FREE_MONTH_REMIND_DAYS_BEFORE = 5;

/**
 * What this phone last heard from the server about the free month, kept in
 * `meta` by `freeMonthAfterRefresh`. '' is "never heard", which is every phone
 * that never signed in. 'claimed' outlives a sign-out on purpose: the account
 * that had its month is the likeliest one to sign in here again.
 */
export type FreeMonthServerState = '' | 'open' | 'closed' | 'claimed';

/**
 * WHO IS INVITED (opt-in only, Mahmood 27 Oct). Everybody who has not had the
 * month and is not Plus right now, signed in or not: the account it needs is
 * half the point of the offer, so having one already is no reason to skip
 * somebody, and not having one is the sign-in flow, not a refusal.
 *
 * SIGNED IN: only once the server has said the offer is open and this account
 * never claimed. Signed out: shown unless this phone remembers a claim. A phone
 * that never joined cannot hear the dashboard's switch at all (it never talks
 * to the server, by design), so a card may be offered while the switch is off;
 * accepting then signs in and the claim answers 'closed'. Accepted.
 *
 * `plus` is `isPlus()`: paid, or a grant still running. Somebody whose earlier
 * gifted Plus has ended is not Plus and is invited like anybody else.
 *
 * A custom server is excluded because a grant from it is ignored by design
 * (`setServerPlus`); the card would promise something this app will not honour.
 */
export function freeMonthInviteDue(s: {
  signedIn: boolean;
  server: FreeMonthServerState;
  plus: boolean;
  available: boolean;
  customServer: boolean;
  declined: boolean;
}): boolean {
  if (s.plus || !s.available || s.customServer || s.declined || s.server === 'claimed') return false;
  return s.signedIn ? s.server === 'open' : true;
}

/**
 * THE TWO REMINDERS, each null when its moment has passed (a month granted on
 * top of a gift that was nearly over, or a clock that is wrong) — a reminder
 * in the past fires at once, which is a lie.
 *
 * `fiveDays` is day 25 of 30, at the time of day the month was claimed.
 * `lastDay` says "ends today", so it must fall on the local DATE the month
 * ends and before the moment it ends: 10:00 that morning, or, for a month that
 * ends before ten, halfway between that midnight and the end.
 */
export function freeMonthReminders(untilIso: string, nowMs: number): { fiveDays: Date | null; lastDay: Date | null } {
  const until = Date.parse(untilIso);
  if (!Number.isFinite(until)) return { fiveDays: null, lastDay: null };
  const five = until - FREE_MONTH_REMIND_DAYS_BEFORE * 86_400_000;
  const midnight = new Date(until);
  midnight.setHours(0, 0, 0, 0);
  const ten = new Date(midnight);
  ten.setHours(10);
  const last = ten.getTime() < until ? ten.getTime() : midnight.getTime() + (until - midnight.getTime()) / 2;
  return {
    fiveDays: five > nowMs ? new Date(five) : null,
    lastDay: last > nowMs ? new Date(last) : null,
  };
}

/**
 * "YOUR FREE MONTH HAS ENDED", ONCE. Due on the first launch after the month
 * this phone claimed (`until`) has passed, and never again (`shown`). Never to
 * somebody who bought Plus — during the month (`bought`, the store said so
 * while the month was known here) or anywhere else (`plus`, the server's
 * `is_plus`, which also covers another grant still running).
 */
export function freeMonthEndDue(s: {
  until: string | null;
  nowMs: number;
  shown: boolean;
  bought: boolean;
  plus: boolean;
  available: boolean;
  customServer: boolean;
}): boolean {
  if (!s.until || s.shown || s.bought || s.plus || !s.available || s.customServer) return false;
  const until = Date.parse(s.until);
  return Number.isFinite(until) && s.nowMs >= until;
}

/**
 * WHAT A PLUS GATE COUNTS AS, for the end screen's "you used". Keyed by the
 * `from` every `requirePlus` call already names; a gate missing here is simply
 * not reported. Cloud Backup has no gate a Plus member passes through, so it
 * is read off its own last-run time instead (`cloudBackupAt`). Wrapped is not
 * here because Wrapped is free: only its themed colour is Plus.
 */
export const FREE_MONTH_USES = ['backup', 'stats', 'themes', 'profile', 'filters'] as const;
export type FreeMonthUse = (typeof FREE_MONTH_USES)[number];

const GATE_USE: Record<string, FreeMonthUse> = {
  deep_stats: 'stats',
  themes: 'themes',
  profile_theme: 'themes',
  icons: 'themes',
  profile_template: 'profile',
  profile_sections: 'profile',
  profile_widgets: 'profile',
  profile_layout: 'profile',
  advanced_filters: 'filters',
  filter_presets: 'filters',
};

export function freeMonthUseOf(from: string): FreeMonthUse | null {
  return (FREE_MONTH_USES as readonly string[]).includes(from) ? (from as FreeMonthUse) : GATE_USE[from] ?? null;
}

/** The comma list in `meta`, plus one more, in the screen's order and without repeats. */
export function addFreeMonthUse(stored: string, use: FreeMonthUse): string {
  const have = new Set(stored.split(',').concat(use));
  return FREE_MONTH_USES.filter((u) => have.has(u)).join(',');
}
