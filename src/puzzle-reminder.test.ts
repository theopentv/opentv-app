import { nextPuzzleReminder } from '@/puzzle';

/** Local wall-clock, as the phone's zone reads it. */
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('nextPuzzleReminder', () => {
  it('today at the hour while today is unplayed and the hour is ahead', () => {
    expect(nextPuzzleReminder(new Date(at(22, 8)), 10, false)).toBe(at(22, 10));
  });

  it('tomorrow once today is played, even before the hour', () => {
    expect(nextPuzzleReminder(new Date(at(22, 8)), 10, true)).toBe(at(23, 10));
  });

  it('tomorrow once the hour has passed, played or not', () => {
    expect(nextPuzzleReminder(new Date(at(22, 10)), 10, false)).toBe(at(23, 10));
    expect(nextPuzzleReminder(new Date(at(22, 21, 30)), 10, false)).toBe(at(23, 10));
  });

  it('rolls over the end of a month', () => {
    expect(nextPuzzleReminder(new Date(2026, 9, 31, 12), 9, true)).toBe(new Date(2026, 10, 1, 9).getTime());
  });
});
