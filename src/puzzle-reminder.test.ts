import { MAX_CATCHUP_NOTIFICATIONS, MAX_EPISODE_NOTIFICATIONS } from '@/notification-plan';
import { PUZZLE_REMINDER_DAYS, planPuzzleReminders } from '@/puzzle';

/** Local wall-clock, as the phone's zone reads it. */
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const plan = (now: number, hour: number, played: boolean, days?: number) =>
  planPuzzleReminders(new Date(now), hour, played, days).map((r) => [r.kind, r.at]);

describe('planPuzzleReminders', () => {
  it('a ready and a last chance every day of the window', () => {
    expect(plan(at(22, 8), 10, false, 2)).toEqual([
      ['ready', at(22, 10)], ['lastChance', at(22, 22)],
      ['ready', at(23, 10)], ['lastChance', at(23, 22)],
    ]);
  });

  it('books a full week, so it keeps going while the app stays shut', () => {
    const r = planPuzzleReminders(new Date(at(22, 8)), 10, false);
    expect(r).toHaveLength(2 * PUZZLE_REMINDER_DAYS);
    expect(r[r.length - 1].at).toBe(at(22 + PUZZLE_REMINDER_DAYS - 1, 22));
  });

  it('today played: nothing today, even the last chance', () => {
    expect(plan(at(22, 8), 10, true, 2)).toEqual([['ready', at(23, 10)], ['lastChance', at(23, 22)]]);
  });

  it('skips what is already past today', () => {
    expect(plan(at(22, 12), 10, false, 1)).toEqual([['lastChance', at(22, 22)]]);
    expect(plan(at(22, 22, 30), 10, false, 1)).toEqual([]);
  });

  it('one reminder a day when the chosen hour is the last chance or later', () => {
    expect(plan(at(22, 8), 21, false, 1)).toEqual([['ready', at(22, 21)], ['lastChance', at(22, 22)]]);
    expect(plan(at(22, 8), 22, false, 1)).toEqual([['ready', at(22, 22)]]);
    expect(plan(at(22, 8), 23, false, 1)).toEqual([['ready', at(22, 23)]]);
  });

  it('rolls over the end of a month', () => {
    expect(plan(new Date(2026, 9, 31, 23).getTime(), 9, true, 2)).toEqual([
      ['ready', new Date(2026, 10, 1, 9).getTime()], ['lastChance', new Date(2026, 10, 1, 22).getTime()],
    ]);
  });

  it('fits under iOS 64 pending beside everything else', () => {
    // planner one-offs: movie night, inactivity, wrapped, popcorn; plus the
    // memory and the goal nudge booked in notifications.ts
    const others = MAX_EPISODE_NOTIFICATIONS + MAX_CATCHUP_NOTIFICATIONS + 4 + 2;
    expect(others + 2 * PUZZLE_REMINDER_DAYS).toBeLessThanOrEqual(64);
  });
});
