/**
 * The free month of Plus (2.0.3) — the decisions, without the phone around
 * them, so the Node runner can pin them. `free-month.ts` does the rest.
 */

/** Days before the month ends that the reminder fires: day 25 of 30. */
export const FREE_MONTH_REMIND_DAYS_BEFORE = 5;

/**
 * WHO IS INVITED. Somebody with no account on this phone and no sign that they
 * ever had one, who is not Plus already, on a build that sells Plus, talking to
 * our server, and who has not said "No thanks".
 *
 * `hadAccount` matters: a phone that remembers a past sign-in belongs to an
 * account that may have taken its month already, and a card promising a month
 * the server then refuses is worse than no card.
 *
 * A custom server is excluded because a grant from it is ignored by design
 * (`setServerPlus`); the card would promise something this app will not honour.
 */
export function freeMonthInviteDue(s: {
  signedIn: boolean;
  hadAccount: boolean;
  plus: boolean;
  available: boolean;
  customServer: boolean;
  declined: boolean;
}): boolean {
  return !s.signedIn && !s.hadAccount && !s.plus && s.available && !s.customServer && !s.declined;
}

/**
 * When the "ends in 5 days" reminder fires, or null when that moment has
 * passed (a month granted on top of a gift that was nearly over, or a clock
 * that is wrong) — a reminder in the past fires at once, which is a lie.
 */
export function freeMonthReminderAt(untilIso: string, nowMs: number): Date | null {
  const until = Date.parse(untilIso);
  if (!Number.isFinite(until)) return null;
  const at = until - FREE_MONTH_REMIND_DAYS_BEFORE * 86_400_000;
  return at > nowMs ? new Date(at) : null;
}

/**
 * WHETHER A DASHBOARD GIFT IS ANNOUNCED. A gift (`via: 'gift'`) this phone has
 * not shown yet (`seen` is the `free_month_at` it last announced), on a build
 * that sells Plus, from our own server, and STILL RUNNING: somebody who
 * updates from 2.0.2 after their gifted month ended must not be told
 * "A month of Plus is yours" about a month that is over.
 */
export function freeMonthGiftDue(s: {
  via: string | null | undefined;
  at: string | null | undefined;
  seen: string;
  plusUntil: string | null | undefined;
  nowMs: number;
  available: boolean;
  customServer: boolean;
}): boolean {
  if (s.via !== 'gift' || !s.at || s.at === s.seen || !s.available || s.customServer) return false;
  const until = Date.parse(s.plusUntil ?? '');
  return Number.isFinite(until) && until > s.nowMs;
}
