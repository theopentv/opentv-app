/**
 * What to notify about, and when — the rules, with no I/O.
 *
 * Kept free of `@/` and react-native imports so Jest can run it under the
 * project's plain-node config. That is the point of the split: scheduling is
 * mechanical, but "is this a season finale", "is this user actually behind",
 * "should this fire at all" is where the bugs live, so those get tests.
 *
 * iOS caps pending local notifications at 64. The budget below stays well
 * under, and finales deliberately cost nothing — a finale IS an episode
 * airing, so its reminder is already scheduled and only the wording changes.
 *
 * Text is never formatted here. English grammar (plurals, word order) has no
 * business in the planner: every `title`/`body` below is either literal,
 * untranslatable content (a show's name) or an i18n KEY plus the raw params
 * to interpolate, resolved via `t()` at the scheduling site in
 * notifications.ts (see TITLE_KEY_KINDS there, and BODY resolution next to
 * it) — the only file in this pipeline allowed to import `@/i18n`.
 */
import type { LocaleKey } from '@/locales/keys';

export type NotifyKind = 'episode' | 'finale' | 'catchup' | 'movieNight' | 'inactivity' | 'popcorn' | 'wrapped' | 'memory';

export type PlannedNotification = {
  /** stable across re-planning, so the same event doesn't read as a new one */
  id: string;
  kind: NotifyKind;
  /** Literal display text for kinds not in TITLE_KEY_KINDS (currently just
   *  `catchup`, whose title is nothing but the show's own name — nothing to
   *  translate). Otherwise an i18n key, interpolated with titleParams. */
  title: string;
  titleParams?: Record<string, string | number>;
  /** Always an i18n key — every kind's body carries either a count (which
   *  needs real pluralisation) or other dynamic content, so there is no
   *  literal-body case left. */
  bodyKey: LocaleKey;
  bodyParams?: Record<string, string | number>;
  /** ms epoch */
  at: number;
  /** Carried on the notification so a tap can open the thing it is about.
   *  Routed in `_layout.tsx`, alongside the community push payloads. */
  data?: Record<string, string>;
};

export type NotifyToggles = Record<NotifyKind, boolean>;

/** One upcoming episode of a followed show. */
export type UpcomingEpisode = {
  showId: number;
  showName: string;
  season: number;
  episode: number;
  title: string | null;
  /** ISO date, 'YYYY-MM-DD' */
  air: string;
  /** episodes in this season, when known — for finale detection */
  seasonTotal: number | null;
  /** highest season number the show has, for series-finale detection */
  lastSeason: number | null;
  /** the show has finished airing for good */
  ended: boolean;
  /** 'HH:MM' from the series record, in the network's own zone (see `airZoneOf`) */
  airsTime?: string | null;
  /** IANA zone `airsTime` is quoted in; null = read it as the phone's own */
  airZone?: string | null;
  /** PLUS ONLY: the smart-reminder options for this show. Absent or null means
   *  the plain reminder, exactly as it always was. */
  smart?: SmartPrefs | null;
};

/** A season the user is close to finishing. */
export type CatchUpCandidate = {
  showId: number;
  showName: string;
  season: number;
  remaining: number;
};

export type PlanInput = {
  upcoming: UpcomingEpisode[];
  catchUp: CatchUpCandidate[];
  /** unwatched films on the watchlist, already released */
  watchlistCount: number;
  /** episodes aired but not watched, across the library */
  unwatchedCount: number;
  /** ms epoch of the last app open */
  lastOpenedAt: number | null;
  /** the user's best popcorn score, 0 if they have never played */
  popcornBest: number;
  /**
   * The month currently running, 'YYYY-MM' — the one whose Wrapped becomes
   * readable the moment it ends. Null for anybody who should hear nothing:
   * not Plus, or the month holds nothing worth a recap.
   */
  wrappedMonth: string | null;
  /** That month as a person reads it ('July 2026'), already localised. */
  wrappedLabel: string | null;
};

/** iOS allows 64 pending; leave room for the other kinds and for headroom. */
export const MAX_EPISODE_NOTIFICATIONS = 30;
export const MAX_CATCHUP_NOTIFICATIONS = 2;
const INACTIVITY_DAYS = 7;

/** 20:00 local on the given ISO date — prime watching hour, and the default. */
export function atEvening(isoDate: string, hour = DEFAULT_REMINDER_HOUR): number {
  return new Date(`${isoDate}T${String(hour).padStart(2, '0')}:00:00`).getTime();
}

/**
 * WHEN AN EPISODE REMINDER ARRIVES, and why it is a setting rather than the
 * air time.
 *
 * A viewer asked for the notification at the moment a show starts, "like in
 * football apps". For traditional broadcast that is answerable -- TheTVDB
 * carries a series air time -- but it is in the NETWORK's timezone, and
 * "United States" is not a timezone: networks quote Eastern, so Los Angeles
 * would be told three hours early. For streaming, which is most of what
 * anybody tracks now, there is no reliable time at all; Silo and Lanterns
 * simply appear.
 *
 * A reminder that says "starts now" and is four hours out is worse than one
 * that never claimed a time. So the honest fix is to let people move the hour
 * to one that suits them, and to keep it a promise the app can keep.
 */
export const DEFAULT_REMINDER_HOUR = 20;

/**
 * Hours outside 0-23, or nothing stored, mean the default.
 *
 * The emptiness check is separate and has to be: `Number('')` and
 * `Number(null)` are both 0, which is a perfectly good hour, so an unset
 * preference would have read as MIDNIGHT and moved everybody's reminders to
 * the middle of the night.
 */
export function reminderHourOf(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_REMINDER_HOUR;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_REMINDER_HOUR;
}

/* ── smart reminders (2.0.0, PLUS) ─────────────────────────────────────────
 *
 * The plain reminder — the user's hour on the air date — stays free and
 * untouched: none of this runs unless a show carries `smart`, and the caller
 * only attaches it for Plus and only when it differs from the default.
 */

/** When a smart reminder fires, relative to the airing. `usual` is the
 *  plain reminder hour, so weekends-only or whole-season can be had alone. */
export type ReminderDelay = 'usual' | 'onAir' | 'hour' | 'threeHours' | 'nextMorning';
export const REMINDER_DELAYS: readonly ReminderDelay[] = ['usual', 'onAir', 'hour', 'threeHours', 'nextMorning'];
export type SmartPrefs = { delay: ReminderDelay; weekendsOnly: boolean; wholeSeason: boolean };
export const DEFAULT_SMART_PREFS: SmartPrefs = { delay: 'usual', weekendsOnly: false, wholeSeason: false };

/** Stored JSON → prefs; null when nothing (valid) is stored. */
export function parseSmartPrefs(raw: string | null | undefined): SmartPrefs | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v == null || typeof v !== 'object') return null;
    return {
      delay: REMINDER_DELAYS.find((d) => d === v.delay) ?? 'usual',
      weekendsOnly: v.weekendsOnly === true,
      wholeSeason: v.wholeSeason === true,
    };
  } catch {
    return null;
  }
}

export function isDefaultSmart(p: SmartPrefs): boolean {
  return p.delay === 'usual' && !p.weekendsOnly && !p.wholeSeason;
}

/**
 * The zone a network quotes its air time in, from the show's country.
 *
 * TheTVDB's `airsTime` is the network's wall clock, and "United States" is not
 * a timezone: American networks quote Eastern (the West Coast's 9pm is a tape
 * delay of the same slot), so Eastern is the honest single answer. Anything not
 * listed is read as the phone's own zone — the calendar has always done that,
 * and it is right for the commonest case, somebody watching their own
 * country's television. Alpha-3 is TheTVDB's code, alpha-2 TMDB's.
 */
const NETWORK_ZONES: Record<string, string> = {
  usa: 'America/New_York', us: 'America/New_York',
  can: 'America/Toronto', ca: 'America/Toronto',
  gbr: 'Europe/London', gb: 'Europe/London', uk: 'Europe/London',
  irl: 'Europe/Dublin', ie: 'Europe/Dublin',
  fra: 'Europe/Paris', fr: 'Europe/Paris',
  deu: 'Europe/Berlin', de: 'Europe/Berlin',
  esp: 'Europe/Madrid', es: 'Europe/Madrid',
  ita: 'Europe/Rome', it: 'Europe/Rome',
  pol: 'Europe/Warsaw', pl: 'Europe/Warsaw',
  tur: 'Europe/Istanbul', tr: 'Europe/Istanbul',
  bra: 'America/Sao_Paulo', br: 'America/Sao_Paulo',
  mex: 'America/Mexico_City', mx: 'America/Mexico_City',
  aus: 'Australia/Sydney', au: 'Australia/Sydney',
  jpn: 'Asia/Tokyo', jp: 'Asia/Tokyo',
  kor: 'Asia/Seoul', kr: 'Asia/Seoul',
};
export function airZoneOf(country: string | null | undefined): string | null {
  return NETWORK_ZONES[(country ?? '').trim().toLowerCase()] ?? null;
}

/** ms the zone's wall clock is ahead of UTC at `at`. Throws on a bad zone. */
function zoneOffset(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(at));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - Math.floor(at / 60000) * 60000;
}

/**
 * The instant an episode goes out: `isoDate` at `hhmm` on `zone`'s clock, or
 * on the phone's own clock when the zone is unknown. Null when there is no
 * usable time at all — streaming mostly — and the caller falls back to the
 * user's own hour rather than inventing one.
 */
export function airInstant(isoDate: string, hhmm: string | null | undefined, zone: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  const [y, mo, d] = isoDate.split('-').map(Number);
  if (!m || !y || !mo || !d) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  if (zone) {
    try {
      // Two passes, because the offset at the guess and at the answer differ
      // on the night the clocks change.
      const guess = Date.UTC(y, mo - 1, d, h, min);
      let at = guess - zoneOffset(guess, zone);
      at = guess - zoneOffset(at, zone);
      return at;
    } catch {
      // an engine without that zone: the phone's own clock, as before
    }
  }
  return new Date(y, mo - 1, d, h, min, 0, 0).getTime();
}

/** Nothing smart arrives between 23:00 and 08:00 on the phone's clock: an
 *  American 9pm is 3am in Europe, and "+3 hours" after a 10pm show is 1am. A
 *  reminder that wakes somebody is the fastest way to have them all turned off. */
export const QUIET_FROM = 23;
export const QUIET_UNTIL = 8;
export const MORNING_HOUR = 9;

export function outOfQuietHours(at: number): number {
  const d = new Date(at);
  const h = d.getHours();
  if (h >= QUIET_FROM) {
    d.setDate(d.getDate() + 1);
    d.setHours(QUIET_UNTIL, 0, 0, 0);
  } else if (h < QUIET_UNTIL) {
    d.setHours(QUIET_UNTIL, 0, 0, 0);
  }
  return d.getTime();
}

/** Saturday or Sunday stays; a weekday moves to the coming Saturday at the
 *  same time of day — the time the person chose still means something. */
export function toWeekend(at: number): number {
  const d = new Date(at);
  const day = d.getDay(); // 0 Sunday, 6 Saturday
  if (day === 0 || day === 6) return at;
  d.setDate(d.getDate() + (6 - day));
  return d.getTime();
}

/**
 * When one smart reminder fires.
 *
 * The base is the real airing when the series has an air time, and the
 * user's own hour on the air date when it does not — a "+1 hour" after a time
 * nobody knows would be an invented time, which is the thing the reminder hour
 * exists to avoid. Next morning is 09:00 after the airing, whichever day that
 * lands on in this zone.
 */
export function smartFireTime(e: Pick<UpcomingEpisode, 'air' | 'airsTime' | 'airZone'>, p: SmartPrefs, reminderHour: number): number {
  const aired = airInstant(e.air, e.airsTime, e.airZone);
  const fallback = atEvening(e.air, reminderHour);
  let at: number;
  if (p.delay === 'usual') at = fallback;
  else if (p.delay === 'nextMorning') {
    const d = new Date(aired ?? atEvening(e.air, 0));
    d.setDate(d.getDate() + 1);
    d.setHours(MORNING_HOUR, 0, 0, 0);
    at = d.getTime();
  } else if (aired == null) at = fallback;
  else at = outOfQuietHours(aired + (p.delay === 'hour' ? 3600000 : p.delay === 'threeHours' ? 3 * 3600000 : 0));
  return p.weekendsOnly ? toWeekend(at) : at;
}

/**
 * One notification per show per moment, for smart shows only.
 *
 * Weekends-only parks a week of episodes on one Saturday, and a streaming drop
 * puts eight on one date; eight buzzes at once for one show is a bug report.
 * They fold into the latest episode with a count. Plain reminders are left
 * exactly as they always were.
 */
export function smartGroups<T extends { e: UpcomingEpisode; at: number; count: number }>(items: T[]): T[] {
  const out: T[] = [];
  const byKey = new Map<string, T>();
  for (const x of items) {
    if (!x.e.smart) {
      out.push(x);
      continue;
    }
    const key = `${x.e.showId}|${x.at}`;
    const g = byKey.get(key);
    if (!g) {
      const copy = { ...x };
      byKey.set(key, copy);
      out.push(copy);
      continue;
    }
    g.count += 1;
    if (x.e.season > g.e.season || (x.e.season === g.e.season && x.e.episode > g.e.episode)) g.e = x.e;
  }
  return out;
}

/**
 * Is this the last episode of its season? Requires knowing the season's size:
 * without it we cannot tell a finale from any other episode, and guessing
 * would label every latest episode a finale.
 */
export function isSeasonFinale(e: UpcomingEpisode): boolean {
  return e.seasonTotal != null && e.seasonTotal > 0 && e.episode === e.seasonTotal;
}

/** The last episode of the last season of a show that has ended. */
export function isSeriesFinale(e: UpcomingEpisode): boolean {
  return e.ended && e.lastSeason != null && e.season === e.lastSeason && isSeasonFinale(e);
}

/**
 * "TONIGHT" ONLY ON THE NIGHT (21 Oct). A smart reminder delivered the next
 * morning, or parked on Saturday by weekends-only, still said "Season finale
 * tonight!" / "airs today". Off the air day the body says it is out instead.
 * The air day is the local date of the air instant when the time is known.
 */
export function onAirDay(e: Pick<UpcomingEpisode, 'air' | 'airsTime' | 'airZone'>, at: number): boolean {
  const aired = new Date(airInstant(e.air, e.airsTime, e.airZone) ?? atEvening(e.air, 0));
  return aired.toDateString() === new Date(at).toDateString();
}

function episodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** The next Friday at `hour` local, strictly in the future. */
export function nextFriday(now: number, hour = 18): number {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  const FRIDAY = 5;
  let delta = (FRIDAY - d.getDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= now) delta = 7; // already past this Friday's slot
  d.setDate(d.getDate() + delta);
  return d.getTime();
}

/** The 1st of the month after `now`, at `hour` local — a morning, so a recap
 *  of the month gone by is the first thing waiting rather than an interruption
 *  in the middle of an evening's watching. Always in the future. */
export function firstOfNextMonth(now: number, hour = 10): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, hour, 0, 0, 0).getTime();
}

/**
 * Everything to schedule, in one pass.
 *
 * Specials (season 0) never notify — they air erratically and are not what
 * anyone is waiting for, matching the behaviour before this engine existed.
 */
export function planNotifications(
  input: PlanInput,
  now: number,
  enabled: NotifyToggles,
  reminderHour: number = DEFAULT_REMINDER_HOUR,
): PlannedNotification[] {
  const out: PlannedNotification[] = [];

  // ---- episodes, and the finales among them ------------------------------
  if (enabled.episode) {
    const dated = smartGroups(
      input.upcoming
        .filter((e) => e.season >= 1) // specials don't ping
        // WHOLE SEASON: only the season's last episode speaks. A season whose
        // size is unknown cannot be told complete, so it keeps the ordinary
        // reminder rather than going silent.
        .filter((e) => !(e.smart?.wholeSeason && e.seasonTotal != null && e.seasonTotal > 0 && e.episode !== e.seasonTotal))
        .map((e) => ({ e, at: e.smart ? smartFireTime(e, e.smart, reminderHour) : atEvening(e.air, reminderHour), count: 1 }))
        .filter((x) => Number.isFinite(x.at) && x.at > now),
    )
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_EPISODE_NOTIFICATIONS);

    for (const { e, at, count } of dated) {
      // Smart wording first: "the whole season is out" is the reason the
      // option exists, and "3 new episodes" is what a weekend batch IS.
      if (e.smart?.wholeSeason && isSeasonFinale(e)) {
        out.push({
          id: `ep-${e.showId}-${e.season}-${e.episode}`,
          kind: 'episode',
          title: 'smartReminders.seasonOutTitle',
          titleParams: { show: e.showName },
          bodyKey: 'smartReminders.seasonOutBody',
          bodyParams: { season: e.season },
          at,
        });
        continue;
      }
      if (count > 1) {
        out.push({
          id: `ep-${e.showId}-${e.season}-${e.episode}`,
          kind: 'episode',
          title: 'localNotifications.episodeTitle',
          titleParams: { show: e.showName },
          bodyKey: 'smartReminders.episodesBody',
          bodyParams: { count },
          at,
        });
        continue;
      }
      const code = episodeCode(e.season, e.episode);
      // a finale replaces the wording of a reminder already being scheduled —
      // it never costs an extra slot
      const series = enabled.finale && isSeriesFinale(e);
      const season = enabled.finale && !series && isSeasonFinale(e);
      out.push({
        id: `ep-${e.showId}-${e.season}-${e.episode}`,
        kind: series || season ? 'finale' : 'episode',
        title: series
          ? 'localNotifications.seriesFinaleTitle'
          : season
            ? 'localNotifications.seasonFinaleTitle'
            : 'localNotifications.episodeTitle',
        titleParams: { show: e.showName },
        bodyKey: onAirDay(e, at)
          ? series
            ? 'localNotifications.seriesFinaleBody'
            : season
              ? 'localNotifications.seasonFinaleBody'
              : e.title
                ? 'localNotifications.episodeBodyNamed'
                : 'localNotifications.episodeBody'
          : series
            ? 'localNotifications.seriesFinaleBodyOut'
            : season
              ? 'localNotifications.seasonFinaleBodyOut'
              : e.title
                ? 'localNotifications.episodeBodyNamedOut'
                : 'localNotifications.episodeBodyOut',
        // finale bodies are fixed text — only the plain-episode bodies interpolate
        bodyParams: series || season ? undefined : e.title ? { code, title: e.title } : { code },
        at,
      });
    }
  }

  // ---- catch-up: nearly done with a season -------------------------------
  if (enabled.catchup) {
    const soon = input.catchUp
      // 0 remaining is a finished season, not a nudge
      .filter((c) => c.remaining > 0 && c.remaining <= 2 && c.season >= 1)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, MAX_CATCHUP_NOTIFICATIONS);
    // tomorrow evening, so it reads as a gentle reminder rather than a
    // reaction to whatever they just watched
    const at = now + 86400000;
    const d = new Date(at);
    d.setHours(20, 0, 0, 0);
    for (const c of soon) {
      out.push({
        id: `catchup-${c.showId}-${c.season}`,
        kind: 'catchup',
        // literal, not a key: this IS the show's name, nothing to translate
        title: c.showName,
        bodyKey: 'localNotifications.catchupBody',
        bodyParams: { count: c.remaining, season: c.season },
        at: d.getTime() > now ? d.getTime() : at,
      });
    }
  }

  // ---- Friday movie night ------------------------------------------------
  // suppressed on an empty watchlist: a reminder to watch nothing is noise
  if (enabled.movieNight && input.watchlistCount > 0) {
    out.push({
      id: 'movie-night',
      kind: 'movieNight',
      title: 'localNotifications.movieNightTitle',
      bodyKey: 'localNotifications.movieNightBody',
      bodyParams: { count: input.watchlistCount },
      at: nextFriday(now),
    });
  }

  // ---- come back ---------------------------------------------------------
  // only when something is actually waiting — nudging a user who is fully
  // caught up is nagging, and gives them nothing to do
  if (enabled.inactivity && input.unwatchedCount > 0) {
    const base = input.lastOpenedAt ?? now;
    out.push({
      id: 'inactivity',
      kind: 'inactivity',
      title: 'localNotifications.stillWatchingTitle',
      bodyKey: 'localNotifications.inactivityBody',
      bodyParams: { count: input.unwatchedCount },
      at: base + INACTIVITY_DAYS * 86400000,
    });
  }

  // ---- the month just closed --------------------------------------------
  // ONE, and only for the month currently running: re-planning happens on
  // every app open, and a fixed id over a re-planned list is what keeps this
  // from stacking a second copy. Anyone who is not Plus arrives here with
  // `wrappedMonth: null` and hears nothing.
  if (enabled.wrapped && input.wrappedMonth && input.wrappedLabel) {
    out.push({
      id: `wrapped-${input.wrappedMonth}`,
      kind: 'wrapped',
      title: 'localNotifications.wrappedTitle',
      titleParams: { period: input.wrappedLabel },
      bodyKey: 'localNotifications.wrappedBody',
      at: firstOfNextMonth(now),
      data: { kind: 'wrapped', month: input.wrappedMonth },
    });
  }

  out.push(...planPopcornChallenge(input, now, enabled));

  return out.filter((n) => n.at > now);
}


/** The coming Saturday at 15:00 — a weekend afternoon, when a game invite is
 *  welcome, rather than competing with the evening episode reminders. */
function nextSaturdayAfternoon(now: number): number {
  const d = new Date(now);
  d.setHours(15, 0, 0, 0);
  const days = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + days);
  if (d.getTime() <= now) d.setDate(d.getDate() + 7);
  return d.getTime();
}

/**
 * The popcorn high-score challenge.
 *
 * Only ever sent to someone who has actually played — challenging a stranger
 * to beat a score they have never set is nonsense, and the game is a small
 * easter egg rather than the point of the app.
 *
 * The id carries the score, so re-planning is stable but a NEW record
 * replaces the old challenge rather than stacking a second one.
 */
export function planPopcornChallenge(input: PlanInput, now: number, enabled: NotifyToggles): PlannedNotification[] {
  if (!enabled.popcorn || input.popcornBest <= 0) return [];
  return [
    {
      id: `popcorn-${input.popcornBest}`,
      kind: 'popcorn',
      title: 'localNotifications.popcornTitle',
      bodyKey: 'localNotifications.popcornBody',
      bodyParams: { score: input.popcornBest },
      at: nextSaturdayAfternoon(now),
    },
  ];
}
