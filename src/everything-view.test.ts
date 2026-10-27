import { everythingCounts, everythingView, sortableDate, type EverythingItem } from '@/everything-view';

const item = (p: Partial<EverythingItem> & { key: string; name: string }): EverythingItem => ({
  kind: 'show',
  search: p.name.toLowerCase(),
  poster: null,
  last: '',
  added: '',
  anime: false,
  ...p,
});

const lib: EverythingItem[] = [
  item({ key: 's:1', name: 'House', last: sortableDate('2026-10-01 20:00:00') }),
  item({ key: 's:2', name: 'Frieren', anime: true, last: sortableDate('2026-10-20T21:00:00Z'), added: '2026-09-01' }),
  item({ key: 'm:Amado', kind: 'movie', name: 'Loved', search: 'loved amado', last: '2026-10-10T00:00:00' }),
  item({ key: 'm:Up', kind: 'movie', name: 'Up' }),
];

describe('everythingView', () => {
  it('mixes shows and films, most recently watched first, never-watched last A-Z', () => {
    expect(everythingView(lib, 'all', 'recent', '').map((x) => x.key)).toEqual(['s:2', 'm:Amado', 's:1', 'm:Up']);
  });

  it('chips split the kinds back out; anime is a subset of shows', () => {
    expect(everythingView(lib, 'shows', 'alpha', '').map((x) => x.name)).toEqual(['Frieren', 'House']);
    expect(everythingView(lib, 'anime', 'alpha', '').map((x) => x.name)).toEqual(['Frieren']);
    expect(everythingView(lib, 'movies', 'alpha', '').map((x) => x.name)).toEqual(['Loved', 'Up']);
  });

  it('search matches a film by the name it shows and the name it was stored under', () => {
    expect(everythingView(lib, 'all', 'alpha', ' AMADO ').map((x) => x.key)).toEqual(['m:Amado']);
    expect(everythingView(lib, 'all', 'alpha', 'lov').map((x) => x.key)).toEqual(['m:Amado']);
  });

  it('last added puts in-app adds first, imports after in A-Z', () => {
    expect(everythingView(lib, 'all', 'added', '').map((x) => x.name)).toEqual(['Frieren', 'House', 'Loved', 'Up']);
  });

  it('counts', () => {
    expect(everythingCounts(lib)).toEqual({ shows: 2, anime: 1, movies: 2 });
  });
});
