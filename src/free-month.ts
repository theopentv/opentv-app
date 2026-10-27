/**
 * "TRY PLUS FREE FOR A MONTH" (2.0.3) — an invitation somebody accepts.
 *
 * Thirty days of Plus once per person, granted by the SERVER into
 * `plus_until` — the lane gifts already use — so it reaches this phone through
 * the `/v1/me` that `refreshSession` asks anyway, and ends on its own. No store
 * trial, nothing renews. It needs an account, and that is half the point:
 * people try Plus AND accounts get made. Everything else in the app still
 * works without one ("No account needed" is a promise in the store listing).
 *
 * OPT-IN ONLY, NEVER GIVEN SILENTLY (Mahmood, 27 Oct). It was first claimed by
 * every sign-in, then also handed out from the dashboard; both are gone. The
 * only thing that asks for a month is "Try it free" on the card, which marks
 * the claim pending. Signed in, it is made at once; signed out, the card opens
 * sign-in and the `refreshSession` that follows makes it. A claim that could
 * not be made (offline, an email address not confirmed yet) stays pending and
 * is made at the next launch. The server decides; this only asks and listens.
 */
import { router } from 'expo-router';

import { track } from '@/analytics';
import { api, ApiError } from '@/api';
import { getToken, hasAccount, refreshSession } from '@/community-session';
import { getMeta, setMeta } from '@/db';
import {
  addFreeMonthUse,
  freeMonthEndDue,
  freeMonthInviteDue,
  freeMonthReminders,
  freeMonthUseOf,
  FREE_MONTH_USES,
  type FreeMonthServerState,
  type FreeMonthUse,
} from '@/free-month-rules';
import { isPlus, PLUS_AVAILABLE } from '@/plus';
import { isCustomServer } from '@/server-url';

const PENDING_KEY = 'freeMonthPending';
/** 'no' once "No thanks" was tapped on either card. One-way: it never re-arms. */
const DECLINED_KEY = 'freeMonthDeclined';
/** The end of the month this phone was granted, for the paywall's sentence. */
export const FREE_MONTH_UNTIL_KEY = 'freeMonthUntil';
/** The scheduled reminders' ids, comma-separated, so a purchase can cancel both. */
const REMINDER_KEY = 'freeMonthReminder';
/** What the server last said: see `FreeMonthServerState`. */
const SERVER_KEY = 'freeMonthServer';
/** '1' once the store said Plus was bought while this phone knew of a month. */
const BOUGHT_KEY = 'freeMonthBought';
/** '1' once "Your free month has ended" was opened. One-way. */
const ENDED_KEY = 'freeMonthEndedShown';
/** The Plus features used during the month, for that screen. See `noteFreeMonthUse`. */
const USED_KEY = 'freeMonthUsed';

export function freeMonthPending(): boolean {
  return getMeta(PENDING_KEY) === '1';
}

/** Whether either invitation card may be drawn. Read in a focus effect, never in render. */
export function freeMonthInviteShown(): boolean {
  return freeMonthInviteDue({
    signedIn: hasAccount(),
    server: (getMeta(SERVER_KEY) ?? '') as FreeMonthServerState,
    plus: isPlus(),
    available: PLUS_AVAILABLE,
    customServer: isCustomServer(),
    declined: getMeta(DECLINED_KEY) === 'no',
  });
}

/**
 * "Try it free", on either card. Pending first, so a claim that fails for a
 * reason that may pass (no network) is made at the next launch. Signed out,
 * the sign-in it opens makes the claim through `refreshSession`.
 */
export async function acceptFreeMonth(from: 'import' | 'profile'): Promise<void> {
  setMeta(PENDING_KEY, '1');
  if (!hasAccount()) {
    track('free_month_invite', { from, answer: 'sign_in' });
    router.push('/sign-in');
    return;
  }
  track('free_month_invite', { from, answer: 'claim' });
  await claimFreeMonth();
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
 * off: the pending claim is dropped rather than asked and refused, and the
 * card hides on a signed-in phone. Remembered in `meta` so the card, which
 * cannot fetch, reads it on focus.
 *
 * THE END. The first launch after the month passed opens "Your free month has
 * ended", once — here because this is the launch's first word from the server
 * on whether somebody is Plus some other way (`is_plus`).
 */
export function freeMonthAfterRefresh(me: {
  free_month_open?: boolean;
  free_month_at?: string | null;
  is_plus?: boolean;
}): void {
  const state: FreeMonthServerState = me.free_month_at ? 'claimed' : me.free_month_open === true ? 'open' : 'closed';
  setMeta(SERVER_KEY, state);
  if (state !== 'open') setMeta(PENDING_KEY, '');
  else if (freeMonthPending()) void claimFreeMonth();

  const due = freeMonthEndDue({
    until: getMeta(FREE_MONTH_UNTIL_KEY),
    nowMs: Date.now(),
    shown: getMeta(ENDED_KEY) === '1',
    bought: getMeta(BOUGHT_KEY) === '1',
    plus: me.is_plus === true,
    available: PLUS_AVAILABLE,
    customServer: isCustomServer(),
  });
  if (!due) return;
  setMeta(ENDED_KEY, '1');
  track('free_month_ended');
  router.push('/free-month-ended');
}

/**
 * A PLUS GATE PASSED DURING THE MONTH. Called by `requirePlus` with the name
 * it was given, so the end screen can say what somebody actually used rather
 * than a list of everything. Only while a month this phone claimed is running
 * and not bought: afterwards it is not a free month any more.
 */
export function noteFreeMonthUse(from: string): void {
  const use = freeMonthUseOf(from);
  if (!use) return;
  const until = Date.parse(getMeta(FREE_MONTH_UNTIL_KEY) ?? '');
  if (!(until > Date.now()) || getMeta(BOUGHT_KEY) === '1') return;
  const stored = getMeta(USED_KEY) ?? '';
  const next = addFreeMonthUse(stored, use);
  if (next !== stored) setMeta(USED_KEY, next);
}

/**
 * What the end screen lists as used, in its order. Cloud Backup from its own
 * last-run time: a backup inside the thirty days counts.
 */
export function freeMonthUsed(): FreeMonthUse[] {
  const used = new Set((getMeta(USED_KEY) ?? '').split(','));
  const until = Date.parse(getMeta(FREE_MONTH_UNTIL_KEY) ?? '');
  const backup = Number(getMeta('cloudBackupAt') ?? '');
  if (backup > until - 30 * 86_400_000 && backup <= until) used.add('backup');
  return FREE_MONTH_USES.filter((u) => used.has(u));
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
    if (!res.granted || !res.plus_until) {
      // 'closed' or 'claimed': the card hides on its next focus.
      if (res.reason === 'closed' || res.reason === 'claimed') setMeta(SERVER_KEY, res.reason);
      return;
    }
    setMeta(SERVER_KEY, 'claimed');
    setMeta(FREE_MONTH_UNTIL_KEY, res.plus_until);
    setMeta(USED_KEY, '');
    track('free_month_granted');
    void scheduleFreeMonthReminders(res.plus_until);
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
 * DAY 25, "Your free month ends in 5 days", AND THE LAST DAY, "Your free month
 * ends today". Both open the paywall, which leads with the annual plan. Local
 * notifications, so they need no push token.
 */
async function scheduleFreeMonthReminders(untilIso: string): Promise<void> {
  const { fiveDays, lastDay } = freeMonthReminders(untilIso, Date.now());
  const ids: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { t } = require('@/i18n') as typeof import('@/i18n');
    const at = async (date: Date | null, title: string) => {
      if (!date) return;
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body: t('freeMonth.reminderBody'),
            // '/paywall' is in MESSAGE_ROUTES, the closed list a tap may open.
            data: { kind: 'message', route: '/paywall' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
        }),
      );
    };
    await at(fiveDays, t('freeMonth.reminderTitle'));
    await at(lastDay, t('freeMonthOptIn.endsTodayTitle'));
  } catch {
    // No permission, or no notifications here: the month still ends quietly.
  }
  setMeta(REMINDER_KEY, ids.join(','));
}

/**
 * The store says Plus is bought. Called on every such answer, so it only acts
 * for a phone that knows of a month: "your free month ends" would now be
 * wrong, and so would "your free month has ended" afterwards.
 */
export function freeMonthBought(): void {
  if (!getMeta(FREE_MONTH_UNTIL_KEY) || getMeta(BOUGHT_KEY) === '1') return;
  setMeta(BOUGHT_KEY, '1');
  const ids = (getMeta(REMINDER_KEY) ?? '').split(',').filter(Boolean);
  if (ids.length === 0) return;
  setMeta(REMINDER_KEY, '');
  void (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as typeof import('expo-notifications');
      for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    } catch {
      // Already fired or gone.
    }
  })();
}
