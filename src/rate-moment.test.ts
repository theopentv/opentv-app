import { rateMomentAfterMark } from '@/rate-moment';

describe('rateMomentAfterMark', () => {
  const base = { owner: 'imported' as const, total: 4000, marks: 1, marksDone: false };
  it('an imported library is not asked on its first tap, however large', () => {
    expect(rateMomentAfterMark(base)).toBeNull();
  });
  it('asks on the 10th tap, imported or fresh', () => {
    expect(rateMomentAfterMark({ ...base, marks: 10 })).toBe('marks');
    expect(rateMomentAfterMark({ ...base, owner: 'fresh', total: 10, marks: 10 })).toBe('marks');
  });
  it('the 10-marks moment is spent once used', () => {
    expect(rateMomentAfterMark({ ...base, marks: 40, marksDone: true })).toBeNull();
  });
  it('keeps the fresh 25-episode rule', () => {
    expect(rateMomentAfterMark({ owner: 'fresh', total: 25, marks: 3, marksDone: true })).toBe('fresh');
    expect(rateMomentAfterMark({ owner: 'fresh', total: 24, marks: 3, marksDone: true })).toBeNull();
  });
  it('never the demo library', () => {
    expect(rateMomentAfterMark({ owner: 'seed', total: 900, marks: 50, marksDone: false })).toBeNull();
  });
});
