/**
 * A FREE MONTH OF PLUS FOR SIGNING IN (2.0.3).
 *
 * Every account gets thirty days of Plus once, granted by the SERVER into
 * `plus_until` — the lane gifts already use — so it reaches this phone through
 * the `/v1/me` that `refreshSession` asks anyway, and ends on its own. No store
 * trial, nothing renews, and no account is required for anything else: "No
 * account needed" is a promise in the store listing, and this is an offer
 * beside it, not a gate in front of it.
 *
 * THE CLAIM IS MADE AFTER A SIGN-IN, NOT ON A TAP. `signIn` marks it pending
 * and `refreshSession` makes it, so every door counts the same — the card,
 * /join, /sign-in, email — and a claim that could not be made (offline, or an
 * email address not confirmed yet, which the server refuses) is simply made at
 * the next launch. The server decides; this only asks once and listens.
 */
import { router } from 'expo-router';

import { track } from '@/analytics';
import { api, ApiError } from '@/api';
import { getToken, hasAccount, lastAccount, refreshSession } from '@/community-session';
import { getMeta, setMeta } from '@/db';
import { freeMonthGiftDue, freeMonthInviteDue, freeMonthReminderAt } from '@/free-month-rules';
import { isPlus, PLUS_AVAILABLE } from '@/plus';
import { isCustomServer } from '@/server-url';

const PENDING_KEY = 'freeMonthPending';
/** 'no' once "No thanks" was tapped on either card. One-way: it never re-arms. */
const DECLINED_KEY = 'freeMonthDeclined';
/** The end of the month this phone was granted, for the paywall's sentence. */
export const FREE_MONTH_UNTIL_KEY = 'freeMonthUntil';
const REMINDER_KEY = 'freeMonthReminder';
/** The `free_month_at` of the dashboard gift this phone has already announced. */
const GIFT_SEEN_KEY = 'freeMonthGiftSeen';

/** Called by `signIn`: the next `refreshSession` asks for the month. */
export function markFreeMonthPending(): void {
  setMeta(PENDING_KEY, '1');
}

export function freeMonthPending(): boolean {
  return getMeta(PENDING_KEY) === '1';
}

/** Whether either invitation card may be drawn. Read in a focus effect, never in render. */
export function freeMonthInviteShown(): boolean {
  const last = lastAccount();
  return freeMonthInviteDue({
    signedIn: hasAccount(),
    hadAccount: !!(last.email || last.provider),
    plus: isPlus(),
    available: PLUS_AVAILABLE,
    customServer: isCustomServer(),
    declined: getMeta(DECLINED_KEY) === 'no',
  });
}

/** "No thanks", on either card. Both stop for good. */
export function declineFreeMonth(from: 'import' | 'profile'): void {
  setMeta(DECLINED_KEY, 'no');
  track('free_month_invite', { from, answer: 'no' });
}

/**
 * WHAT `refreshSession` HEARD, on the `/v1/me` every launch asks.
 *
 * THE SWITCH. `free_month_open: false` is the dashboard saying the offer is
 * off: the pending claim is dropped rather than asked and refused. Absent (a
 * server from before the switch) keeps the old behaviour, ask and listen.
 *
 * THE GIFT. Accounts that existed before 2.0.3 are given their month from the
 * dashboard ("Give everyone a month", `free_month_via: 'gift'`), not claimed
 * from here — this replaced a once-per-phone claim on the first 2.0.3 launch
 * (Mahmood, 27 Oct), so the offer can be timed and counted in one place. A
 * month nobody asked for is a month nobody knows about, so the same "A month
 * of Plus is yours" screen opens once for it, with the heard-from question.
 */
export function freeMonthAfterRefresh(me: {
  free_month_open?: boolean;
  free_month_at?: string | null;
  free_month_via?: string | null;
  plus_until?: string | null;
}): void {
  if (me.free_month_open === false) setMeta(PENDING_KEY, '');
  else if (freeMonthPending()) void claimFreeMonth();

  const due = freeMonthGiftDue({
    via: me.free_month_via,
    at: me.free_month_at,
    seen: getMeta(GIFT_SEEN_KEY) ?? '',
    plusUntil: me.plus_until,
    nowMs: Date.now(),
    available: PLUS_AVAILABLE,
    customServer: isCustomServer(),
  });
  if (!due || !me.free_month_at || !me.plus_until) return;
  setMeta(GIFT_SEEN_KEY, me.free_month_at);
  setMeta(FREE_MONTH_UNTIL_KEY, me.plus_until);
  track('free_month_granted');
  void scheduleFreeMonthReminder(me.plus_until);
  router.push('/free-month');
}

let claiming = false;

export async function claimFreeMonth(): Promise<void> {
  if (claiming) return;
  claiming = true;
  try {
    // A grant from somebody else's server is ignored (`setServerPlus`), and a
    // build that cannot sell Plus has nothing to remind anybody about.
    if (!PLUS_AVAILABLE || isCustomServer()) {
      setMeta(PENDING_KEY, '');
      return;
    }
    const token = await getToken();
    if (!token) return;
    const res = await api<{ granted: boolean; plus_until?: string; reason?: string }>('/v1/me/free-month', {
      method: 'POST',
      token,
    });
    setMeta(PENDING_KEY, '');
    if (!res.granted || !res.plus_until) return;
    setMeta(FREE_MONTH_UNTIL_KEY, res.plus_until);
    track('free_month_granted');
    void scheduleFreeMonthReminder(res.plus_until);
    // Plus switches on through the same read every grant uses.
    await refreshSession().catch(() => {});
    router.push('/free-month');
  } catch (e) {
    /*
     * KEPT PENDING for the next launch when the answer may change: no network,
     * an email not confirmed yet, too many requests. Any other refusal is final
     * and is not asked again on every launch for ever.
     */
    const retry =
      !(e instanceof ApiError) ||
      e.code === 'network' ||
      e.code === 'email_unverified' ||
      e.code === 'rate_limited' ||
      e.status >= 500;
    if (!retry) setMeta(PENDING_KEY, '');
  } finally {
    claiming = false;
  }
}

/**
 * DAY 25: "Your free month ends in 5 days", opening the paywall, which leads
 * with the annual plan. A local notification, so it needs no push token and
 * works for an account that never joined the community.
 */
async function scheduleFreeMonthReminder(untilIso: string): Promise<void> {
  const at = freeMonthReminderAt(untilIso, Date.now());
  if (!at) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { t } = require('@/i18n') as typeof import('@/i18n');
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('freeMonth.reminderTitle'),
        body: t('freeMonth.reminderBody'),
        // '/paywall' is in MESSAGE_ROUTES, the closed list a tap may open.
        data: { kind: 'message', route: '/paywall' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    setMeta(REMINDER_KEY, id);
  } catch {
    // No permission, or no notifications here: the month still ends quietly.
  }
}

/** Bought Plus before day 25: "your free month ends" would now be wrong. */
export function cancelFreeMonthReminder(): void {
  const id = getMeta(REMINDER_KEY);
  if (!id) return;
  setMeta(REMINDER_KEY, '');
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired or gone.
    }
  })();
}
