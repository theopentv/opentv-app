import { dayCacheState, parseDayCache, readyPrefix, type DayCache } from './feed-cache';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const H = 3600_000;
const entry = (built: Date, over: Partial<DayCache<number>> = {}): DayCache<number> => ({
  day: `${built.getFullYear()}-${String(built.getMonth() + 1).padStart(2, '0')}-${String(built.getDate()).padStart(2, '0')}`,
  at: built.getTime(),
  key: 'en|eng',
  items: [1, 2, 3],
  ...over,
});

describe('dayCacheState', () => {
  it('builds when there is nothing', () => {
    expect(dayCacheState(null, at(2026, 10, 22), 'en|eng', 3 * H)).toBe('miss');
  });

  it('serves a recent same-day build without asking', () => {
    expect(dayCacheState(entry(at(2026, 10, 22, 9)), at(2026, 10, 22, 11), 'en|eng', 3 * H)).toBe('fresh');
  });

  it('serves an older same-day build but refreshes it', () => {
    expect(dayCacheState(entry(at(2026, 10, 22, 8)), at(2026, 10, 22, 12), 'en|eng', 3 * H)).toBe('stale');
  });

  it('never serves yesterday', () => {
    // one minute either side of midnight
    expect(dayCacheState(entry(new Date(2026, 9, 21, 23, 59)), new Date(2026, 9, 22, 0, 1), 'en|eng', 3 * H)).toBe('miss');
  });

  it('rebuilds when the language changed — titles and plots are in it', () => {
    expect(dayCacheState(entry(at(2026, 10, 22, 11)), at(2026, 10, 22, 12), 'ar|ara', 3 * H)).toBe('miss');
  });

  it('treats an empty list as nothing', () => {
    expect(dayCacheState(entry(at(2026, 10, 22, 11), { items: [] }), at(2026, 10, 22, 12), 'en|eng', 3 * H)).toBe('miss');
  });

  it('a clock that went backwards is stale, not fresh', () => {
    expect(dayCacheState(entry(at(2026, 10, 22, 14)), at(2026, 10, 22, 12), 'en|eng', 3 * H)).toBe('stale');
  });
});

describe('parseDayCache', () => {
  it('survives junk', () => {
    expect(parseDayCache(null)).toBeNull();
    expect(parseDayCache('{oops')).toBeNull();
    expect(parseDayCache('null')).toBeNull();
    expect(parseDayCache(JSON.stringify(entry(at(2026, 10, 22))))?.items).toEqual([1, 2, 3]);
  });
});

describe('readyPrefix', () => {
  it('draws only the settled prefix, in order', () => {
    // #2 is still loading, so #3 waits even though it is done
    expect(readyPrefix(['a', 'b', null, 'd'], [true, true, false, true], 10)).toEqual(['a', 'b']);
  });

  it('skips unusable rows without stopping', () => {
    expect(readyPrefix(['a', null, 'c'], [true, true, true], 10)).toEqual(['a', 'c']);
  });

  it('never exceeds the limit', () => {
    expect(readyPrefix(['a', 'b', 'c', 'd'], [true, true, true, true], 2)).toEqual(['a', 'b']);
  });

  it('is empty until the first card lands', () => {
    expect(readyPrefix(['a', 'b'], [false, true], 10)).toEqual([]);
  });
});
