/**
 * The year-end Wrapped (2.0.3): the current year is offered from 1 December,
 * and the "your year is ready" prompt runs through December and January.
 * Every date is passed in, so these stand on any day the suite runs.
 */
import { periodOptions, wrappedYearOut, wrappedYearToOffer } from './pure';
import { planNotifications, yearWrappedAt, type NotifyToggles, type PlanInput } from './notification-plan';

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
  it('carries into January, then goes quiet', () => {
    expect(wrappedYearToOffer('2027-01-20', '2025')).toBe('2026');
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
