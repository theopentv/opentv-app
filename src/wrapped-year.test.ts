/**
 * The year-end Wrapped (2.0.3): the current year is offered from 1 December,
 * and the "your year is ready" prompt runs through December and January.
 * Every date is passed in, so these stand on any day the suite runs.
 */
import {
  periodOptions,
  wrappedFinalNotifyYear,
  wrappedFinalToOffer,
  wrappedOpenedStage,
  wrappedSoFar,
  wrappedYearOut,
  wrappedYearToOffer,
  wrappedYearWorthNudge,
} from './pure';
import { planNotifications, yearCompleteAt, yearWrappedAt, type NotifyToggles, type PlanInput } from './notification-plan';

describe('wrappedYearOut', () => {
  it('is the current year all of December', () => {
    expect(wrappedYearOut('2026-12-01')).toBe('2026');
    expect(wrappedYearOut('2026-12-31')).toBe('2026');
  });
  it('is still last year in January', () => {
    expect(wrappedYearOut('2027-01-01')).toBe('2026');
    expect(wrappedYearOut('2027-01-31')).toBe('2026');
  });
  it('is nothing the rest of the year', () => {
    expect(wrappedYearOut('2026-11-30')).toBeNull();
    expect(wrappedYearOut('2027-02-01')).toBeNull();
    expect(wrappedYearOut('2026-07-14')).toBeNull();
    expect(wrappedYearOut('')).toBeNull();
  });
});

describe('periodOptions in December', () => {
  it('offers the year still running from 1 December', () => {
    expect(periodOptions('2026-12-01', [2026, 2025], 2)).toEqual(['2026-11', '2026-10', '2026', '2025']);
  });
  it('does not offer it on 30 November', () => {
    expect(periodOptions('2026-11-30', [2026, 2025], 1)).toEqual(['2026-10', '2025']);
  });
  it('January of the next year still offers it, as before', () => {
    expect(periodOptions('2027-01-05', [2026, 2025], 1)).toEqual(['2026-12', '2026', '2025']);
  });
  it('never offers a year with nothing watched in it', () => {
    expect(periodOptions('2026-12-03', [2025], 1)).toEqual(['2026-11', '2025']);
  });
});

describe('wrappedYearToOffer', () => {
  it('offers the year from 1 December until it is answered', () => {
    expect(wrappedYearToOffer('2026-11-30', null)).toBeNull();
    expect(wrappedYearToOffer('2026-12-01', null)).toBe('2026');
    expect(wrappedYearToOffer('2026-12-01', '')).toBe('2026');
    expect(wrappedYearToOffer('2026-12-09', '2026')).toBeNull();
  });
  it('ends with December: January belongs to the final card', () => {
    expect(wrappedYearToOffer('2026-12-31', '2025')).toBe('2026');
    expect(wrappedYearToOffer('2027-01-01', '2025')).toBeNull();
    expect(wrappedYearToOffer('2027-02-01', null)).toBeNull();
  });
  it('re-arms the next December', () => {
    expect(wrappedYearToOffer('2027-12-01', '2026')).toBe('2027');
  });
});

describe('the year-end Wrapped notification', () => {
  const ON = { episode: true, finale: true, catchup: true, movieNight: true, inactivity: true, popcorn: true, wrapped: true, memory: true } as NotifyToggles;
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    upcoming: [],
    catchUp: [],
    watchlistCount: 0,
    unwatchedCount: 0,
    lastOpenedAt: null,
    popcornBest: 0,
    wrappedMonth: null,
    wrappedLabel: null,
    wrappedYear: '2026',
    wrappedFinalYear: null,
    ...over,
  });
  const year = (now: number, over: Partial<PlanInput> = {}, toggles = ON) =>
    planNotifications(input(over), now, toggles).filter((n) => n.kind === 'wrapped');

  it('is planned for 1 December at noon, from a launch in November', () => {
    const [n] = year(new Date('2026-11-10T09:00:00').getTime());
    expect(n.at).toBe(new Date('2026-12-01T12:00:00').getTime());
    expect(n.at).toBe(yearWrappedAt('2026'));
    expect(n.id).toBe('wrapped-year-2026');
    expect(n.data).toEqual({ kind: 'wrapped', year: '2026' });
    expect(n.titleParams).toEqual({ year: '2026' });
  });

  it('needs no Plus: a free user with no month nudge still gets it', () => {
    expect(year(new Date('2026-10-27T09:00:00').getTime(), { wrappedMonth: null })).toHaveLength(1);
  });

  it('is gone once 1 December noon has passed, and silent with nothing watched or the toggle off', () => {
    expect(year(new Date('2026-12-02T09:00:00').getTime())).toEqual([]);
    expect(year(new Date('2026-11-10T09:00:00').getTime(), { wrappedYear: null })).toEqual([]);
    expect(year(new Date('2026-11-10T09:00:00').getTime(), {}, { ...ON, wrapped: false })).toEqual([]);
  });

  it('does not land on the month nudge, which fires at 10:00 the same day', () => {
    const now = new Date('2026-11-10T09:00:00').getTime();
    const both = year(now, { wrappedMonth: '2026-11', wrappedLabel: 'November 2026' });
    expect(both).toHaveLength(2);
    expect(new Set(both.map((n) => n.at)).size).toBe(2);
  });
});

describe('the year, so far and then complete', () => {
  it('says "so far" only while today is inside that year', () => {
    expect(wrappedSoFar('2026', '2026-12-01')).toBe(true);
    expect(wrappedSoFar('2026', '2026-12-31')).toBe(true);
    expect(wrappedSoFar('2026', '2027-01-01')).toBe(false);
    expect(wrappedSoFar('2025', '2026-12-01')).toBe(false);
    expect(wrappedSoFar('2026-11', '2026-12-01')).toBe(false);
  });

  it('offers the final card all January, until answered', () => {
    expect(wrappedFinalToOffer('2026-12-31', null)).toBeNull();
    expect(wrappedFinalToOffer('2027-01-01', null)).toBe('2026');
    expect(wrappedFinalToOffer('2027-01-31', '2025')).toBe('2026');
    expect(wrappedFinalToOffer('2027-01-05', '2026')).toBeNull();
    expect(wrappedFinalToOffer('2027-02-01', null)).toBeNull();
    expect(wrappedFinalToOffer('', null)).toBeNull();
  });

  it('is a separate stage: opening December does not answer January', () => {
    expect(wrappedOpenedStage('2026', '2026-12-03')).toBe('year');
    expect(wrappedOpenedStage('2026', '2027-01-02')).toBe('final');
    expect(wrappedOpenedStage('2026', '2026-11-30')).toBeNull();
    expect(wrappedOpenedStage('2025', '2026-12-03')).toBeNull();
    expect(wrappedOpenedStage('2026-11', '2026-12-03')).toBeNull();
    // Answered in December, the final card is still owed.
    expect(wrappedFinalToOffer('2027-01-01', '')).toBe('2026');
  });

  it('plans the final for the running year, and keeps it through the morning of 1 January', () => {
    expect(wrappedFinalNotifyYear('2026-10-27', null)).toBe('2026');
    expect(wrappedFinalNotifyYear('2026-12-31', null)).toBe('2026');
    expect(wrappedFinalNotifyYear('2027-01-01', null)).toBe('2026');
    expect(wrappedFinalNotifyYear('2027-01-01', '2026')).toBeNull();
    expect(wrappedFinalNotifyYear('2027-01-02', '2026')).toBe('2027');
  });

  it('nudges only a year with ten episodes or three films', () => {
    expect(wrappedYearWorthNudge({ episodes: 9, films: 2 })).toBe(false);
    expect(wrappedYearWorthNudge({ episodes: 10, films: 0 })).toBe(true);
    expect(wrappedYearWorthNudge({ episodes: 0, films: 3 })).toBe(true);
    expect(wrappedYearWorthNudge({ episodes: 0, films: 0 })).toBe(false);
  });
});

describe('the year-complete notification', () => {
  const ON = { episode: true, finale: true, catchup: true, movieNight: true, inactivity: true, popcorn: true, wrapped: true, memory: true } as NotifyToggles;
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    upcoming: [],
    catchUp: [],
    watchlistCount: 0,
    unwatchedCount: 0,
    lastOpenedAt: null,
    popcornBest: 0,
    wrappedMonth: null,
    wrappedLabel: null,
    wrappedYear: null,
    wrappedFinalYear: '2026',
    ...over,
  });
  const final = (now: number, over: Partial<PlanInput> = {}, toggles = ON) =>
    planNotifications(input(over), now, toggles).filter((n) => n.id.startsWith('wrapped-final-'));

  it('is planned for 1 January at noon, alongside December\'s', () => {
    const now = new Date('2026-11-10T09:00:00').getTime();
    const [n] = final(now);
    expect(n.at).toBe(new Date('2027-01-01T12:00:00').getTime());
    expect(n.at).toBe(yearCompleteAt('2026'));
    expect(n.data).toEqual({ kind: 'wrapped', year: '2026' });
    const both = planNotifications(input({ wrappedYear: '2026' }), now, ON).filter((x) => x.kind === 'wrapped');
    expect(both.map((x) => x.id).sort()).toEqual(['wrapped-final-2026', 'wrapped-year-2026']);
  });

  it('survives a re-plan on the morning of 1 January, and is gone after noon', () => {
    expect(final(new Date('2027-01-01T09:00:00').getTime())).toHaveLength(1);
    expect(final(new Date('2027-01-01T12:30:00').getTime())).toEqual([]);
  });

  it('is silent for a thin or already-opened year, or with the toggle off', () => {
    const now = new Date('2026-12-05T09:00:00').getTime();
    expect(final(now, { wrappedFinalYear: null })).toEqual([]);
    expect(final(now, {}, { ...ON, wrapped: false })).toEqual([]);
  });
});
