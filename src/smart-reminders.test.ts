import {
  airInstant,
  airZoneOf,
  atEvening,
  DEFAULT_SMART_PREFS,
  isDefaultSmart,
  outOfQuietHours,
  parseSmartPrefs,
  planNotifications,
  smartFireTime,
  toWeekend,
  type NotifyToggles,
  type PlanInput,
  type SmartPrefs,
  type UpcomingEpisode,
} from './notification-plan';

// Local-clock helpers, so every expectation holds in whatever zone the suite runs.
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

const EP: UpcomingEpisode = {
  showId: 1,
  showName: 'Show',
  season: 2,
  episode: 3,
  title: null,
  air: '2026-10-20', // a Tuesday
  seasonTotal: 8,
  lastSeason: 2,
  ended: false,
};
const prefs = (p: Partial<SmartPrefs>): SmartPrefs => ({ ...DEFAULT_SMART_PREFS, ...p });

describe('smart prefs storage', () => {
  it('reads what was stored and rejects junk', () => {
    expect(parseSmartPrefs(null)).toBeNull();
    expect(parseSmartPrefs('nope')).toBeNull();
    expect(parseSmartPrefs('{"delay":"hour","weekendsOnly":true}')).toEqual({ delay: 'hour', weekendsOnly: true, wholeSeason: false });
    expect(parseSmartPrefs('{"delay":"never"}')?.delay).toBe('usual');
  });
  it('knows the default', () => {
    expect(isDefaultSmart(DEFAULT_SMART_PREFS)).toBe(true);
    expect(isDefaultSmart(prefs({ wholeSeason: true }))).toBe(false);
  });
});

describe('air instant', () => {
  it('reads a network time in the network zone', () => {
    // 21:00 Eastern in October is EDT, UTC-4 → 01:00 UTC the next day
    expect(airInstant('2026-10-20', '21:00', 'America/New_York')).toBe(Date.UTC(2026, 9, 21, 1, 0));
    expect(airInstant('2026-10-20', '21:00', 'UTC')).toBe(Date.UTC(2026, 9, 20, 21, 0));
  });
  it('crosses a clock change correctly', () => {
    // 1 Nov 2026 is the US fall-back day: 21:00 that evening is EST, UTC-5
    expect(airInstant('2026-11-01', '21:00', 'America/New_York')).toBe(Date.UTC(2026, 10, 2, 2, 0));
  });
  it('falls back to the phone clock, and to nothing without a time', () => {
    expect(airInstant('2026-10-20', '21:30', null)).toBe(local(2026, 10, 20, 21, 30));
    expect(airInstant('2026-10-20', null, 'UTC')).toBeNull();
    expect(airInstant('2026-10-20', '25:00', null)).toBeNull();
  });
  it('maps both country code styles', () => {
    expect(airZoneOf('usa')).toBe('America/New_York');
    expect(airZoneOf('GB')).toBe('Europe/London');
    expect(airZoneOf('xyz')).toBeNull();
    expect(airZoneOf(null)).toBeNull();
  });
});

describe('quiet hours and weekends', () => {
  it('moves the small hours to 08:00', () => {
    expect(outOfQuietHours(local(2026, 10, 20, 3))).toBe(local(2026, 10, 20, 8));
    expect(outOfQuietHours(local(2026, 10, 20, 23, 30))).toBe(local(2026, 10, 21, 8));
    expect(outOfQuietHours(local(2026, 10, 20, 21))).toBe(local(2026, 10, 20, 21));
  });
  it('parks a weekday on Saturday at the same time', () => {
    expect(toWeekend(local(2026, 10, 20, 21))).toBe(local(2026, 10, 24, 21)); // Tue → Sat
    expect(toWeekend(local(2026, 10, 24, 9))).toBe(local(2026, 10, 24, 9)); // Sat stays
    expect(toWeekend(local(2026, 10, 25, 9))).toBe(local(2026, 10, 25, 9)); // Sun stays
  });
});

describe('smart fire time', () => {
  const timed = { ...EP, airsTime: '21:00', airZone: null };
  it('usual is the plain reminder hour', () => {
    expect(smartFireTime(timed, prefs({}), 20)).toBe(atEvening('2026-10-20', 20));
  });
  it('on air, +1h and +3h count from the airing', () => {
    expect(smartFireTime(timed, prefs({ delay: 'onAir' }), 20)).toBe(local(2026, 10, 20, 21));
    expect(smartFireTime(timed, prefs({ delay: 'hour' }), 20)).toBe(local(2026, 10, 20, 22));
    // 00:00 is quiet → 08:00 next day
    expect(smartFireTime(timed, prefs({ delay: 'threeHours' }), 20)).toBe(local(2026, 10, 21, 8));
  });
  it('without an air time, offsets fall back to the reminder hour', () => {
    expect(smartFireTime(EP, prefs({ delay: 'hour' }), 19)).toBe(atEvening('2026-10-20', 19));
  });
  it('next morning is 09:00 the day after', () => {
    expect(smartFireTime(timed, prefs({ delay: 'nextMorning' }), 20)).toBe(local(2026, 10, 21, 9));
    expect(smartFireTime(EP, prefs({ delay: 'nextMorning' }), 20)).toBe(local(2026, 10, 21, 9));
  });
  it('weekends only applies on top', () => {
    expect(smartFireTime(timed, prefs({ delay: 'onAir', weekendsOnly: true }), 20)).toBe(local(2026, 10, 24, 21));
  });
});

describe('planner with smart shows', () => {
  const ON: NotifyToggles = {
    episode: true, finale: true, catchup: false, movieNight: false, inactivity: false, popcorn: false, wrapped: false, memory: false,
  };
  const input = (upcoming: UpcomingEpisode[]): PlanInput => ({
    upcoming, catchUp: [], watchlistCount: 0, unwatchedCount: 0, lastOpenedAt: null, popcornBest: 0, wrappedMonth: null, wrappedLabel: null,
  });
  const now = local(2026, 10, 19, 12);

  it('whole season: one notification, on the last episode', () => {
    const season = [6, 7, 8].map((episode, i) => ({ ...EP, episode, air: `2026-10-2${i}`, smart: prefs({ wholeSeason: true }) }));
    const out = planNotifications(input(season), now, ON);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'ep-1-2-8', title: 'smartReminders.seasonOutTitle', bodyParams: { season: 2 } });
  });

  it('whole season with an unknown season size keeps every reminder', () => {
    const eps = [6, 7].map((episode) => ({ ...EP, episode, air: `2026-10-2${episode - 6}`, seasonTotal: null, smart: prefs({ wholeSeason: true }) }));
    expect(planNotifications(input(eps), now, ON)).toHaveLength(2);
  });

  it('a weekend batch folds into one per show, with a count', () => {
    const week = ['2026-10-20', '2026-10-21', '2026-10-22'].map((air, i) => ({ ...EP, episode: 3 + i, air, smart: prefs({ weekendsOnly: true }) }));
    const out = planNotifications(input(week), now, ON);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'ep-1-2-5', bodyKey: 'smartReminders.episodesBody', bodyParams: { count: 3 }, at: atEvening('2026-10-24', 20) });
  });

  it('plain shows are untouched: a drop of three still gets three', () => {
    const drop = [1, 2, 3].map((episode) => ({ ...EP, episode }));
    expect(planNotifications(input(drop), now, ON)).toHaveLength(3);
  });

  it('a weekend reminder for an episode that aired days ago is still planned', () => {
    const past = { ...EP, air: '2026-10-20', smart: prefs({ weekendsOnly: true }) };
    const out = planNotifications(input([past]), local(2026, 10, 22, 12), ON);
    expect(out.map((n) => n.at)).toEqual([atEvening('2026-10-24', 20)]);
  });
});
