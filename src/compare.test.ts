import { sideFromPublished, tasteMatch } from '@/compare-pure';

describe('sideFromPublished', () => {
  it('adds show and film minutes, and keeps "not published" apart from zero', () => {
    expect(sideFromPublished({ episodes_watched: 10, minutes_watched: 400, movie_minutes: 200, movies_count: 2 })).toEqual({
      minutes: 600,
      episodes: 10,
      films: 2,
    });
    expect(sideFromPublished(null)).toEqual({ minutes: null, episodes: null, films: null });
  });
});

describe('tasteMatch', () => {
  it('identical shelves match at 100%', () => {
    const k = { shows: ['1', '2'], movies: ['heat|1995'] };
    expect(tasteMatch(k, k, 250)).toEqual({ showsInCommon: 2, filmsInCommon: 1, percent: 100 });
  });
  it('nothing in common is 0%, and an empty side is no percentage at all', () => {
    expect(tasteMatch({ shows: ['1'], movies: [] }, { shows: ['2'], movies: [] }, 250).percent).toBe(0);
    expect(tasteMatch({ shows: [], movies: [] }, { shows: ['2'], movies: [] }, 250).percent).toBeNull();
    expect(tasteMatch({ shows: ['1'], movies: [] }, { shows: [], movies: [] }, 250).percent).toBeNull();
  });
  it('a tiny library inside a big one is not a perfect match', () => {
    const mine = { shows: Array.from({ length: 100 }, (_, i) => String(i)), movies: [] };
    const r = tasteMatch(mine, { shows: ['1', '2', '3'], movies: [] }, 250);
    expect(r.showsInCommon).toBe(3);
    expect(r.percent).toBe(6); // 2·3 / 103
  });
  it('a capped shelf is measured against my same-length recent shelf', () => {
    const all = Array.from({ length: 900 }, (_, i) => String(i));
    // their free shelf: the 250 most recent of the same library
    const r = tasteMatch({ shows: all, movies: [] }, { shows: all.slice(0, 250), movies: [] }, 250);
    expect(r.percent).toBe(100);
    expect(r.showsInCommon).toBe(250);
  });
  it('"in common" counts my whole library even when the percentage is cut', () => {
    const mine = Array.from({ length: 300 }, (_, i) => String(i));
    const theirs = [...mine.slice(0, 249), '299'];
    const r = tasteMatch({ shows: mine, movies: [] }, { shows: theirs, movies: [] }, 250);
    expect(r.showsInCommon).toBe(250);
    expect(r.percent).toBe(100); // 2·249 / 500 = 99.6, rounded
  });
  it('duplicate keys on a shelf count once', () => {
    expect(tasteMatch({ shows: ['1', '1'], movies: [] }, { shows: ['1'], movies: [] }, 250).percent).toBe(100);
  });
});
