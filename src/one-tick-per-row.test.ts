import { oneTickPerRow } from './pure';

describe('oneTickPerRow', () => {
  it('ticks only the series whose id is in the library, not its namesake', () => {
    const casino = { showId: 111 }; // both rows match by title; only one by id
    expect(
      oneTickPerRow([
        { key: 'a', tvdbId: 222, hit: casino },
        { key: 'b', tvdbId: 111, hit: casino },
      ]),
    ).toEqual(new Set(['b']));
  });

  it('a stale-id row is still ticked once, on the first title match', () => {
    const row = { showId: 999 };
    expect(
      oneTickPerRow([
        { key: 'a', tvdbId: 1, hit: row },
        { key: 'b', tvdbId: 2, hit: row },
        { key: 'c', tvdbId: 3, hit: null },
      ]),
    ).toEqual(new Set(['a']));
  });

  it('films and different rows tick independently', () => {
    expect(
      oneTickPerRow([
        { key: 'm1', hit: { movie: 'Casino' } },
        { key: 'm2', hit: { movie: 'Casino Royale' } },
        { key: 's1', tvdbId: 5, hit: { showId: 5 } },
      ]),
    ).toEqual(new Set(['m1', 'm2', 's1']));
  });
});
