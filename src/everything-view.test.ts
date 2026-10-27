import { everythingView, sortableDate, watchedFilms, type EverythingItem } from '@/everything-view';
import { DEFAULT_FILTERS, filterOptions, matchesFilters, type TitleFacts } from '@/pure';

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
    expect(everythingView(lib, 'lastWatched', '').map((x) => x.key)).toEqual(['s:2', 'm:Amado', 's:1', 'm:Up']);
  });

  it('search matches a film by the name it shows and the name it was stored under', () => {
    expect(everythingView(lib, 'alpha', ' AMADO ').map((x) => x.key)).toEqual(['m:Amado']);
    expect(everythingView(lib, 'alpha', 'lov').map((x) => x.key)).toEqual(['m:Amado']);
  });

  it('last added puts in-app adds first, imports after in A-Z', () => {
    expect(everythingView(lib, 'lastAdded', '').map((x) => x.name)).toEqual(['Frieren', 'House', 'Loved', 'Up']);
  });

  it('does not reorder the array it was given', () => {
    const before = lib.map((x) => x.key);
    everythingView(lib, 'alpha', '');
    expect(lib.map((x) => x.key)).toEqual(before);
  });
});

describe('watchedFilms', () => {
  it('keeps films with a first watch and drops the watchlist', () => {
    // The bug of 27 Oct: "Not watched, added Oct 19" listed under Everything I watch.
    const films = [
      { name: 'Seen', watchedAt: '2026-10-01 20:00:00' },
      { name: 'Planned', watchedAt: null },
    ];
    expect(watchedFilms(films).map((m) => m.name)).toEqual(['Seen']);
  });
});

describe('the Type axis', () => {
  // Facts as `everythingFacts` builds them: an anime is a show AND an anime.
  const fact = (key: string, types: string[], progress: string): TitleFacts => ({
    key, types, progress, genres: [], network: null, decade: null, runtime: null, watchedYears: [], stars: null,
  });
  const facts = [
    fact('s:1', ['show'], 'watching'),
    fact('s:2', ['show', 'anime'], 'upToDate'),
    fact('m:Up', ['movie'], 'watched'),
  ];
  const kept = (types: string[]) => facts.filter((f) => matchesFilters(f, { ...DEFAULT_FILTERS, types })).map((f) => f.key);

  it('nothing ticked is All', () => {
    expect(kept([])).toEqual(['s:1', 's:2', 'm:Up']);
  });

  it('anime is a subset of shows', () => {
    expect(kept(['show'])).toEqual(['s:1', 's:2']);
    expect(kept(['anime'])).toEqual(['s:2']);
    expect(kept(['movie'])).toEqual(['m:Up']);
    expect(kept(['anime', 'movie'])).toEqual(['s:2', 'm:Up']);
  });

  it('offers the types this library has, in order, with counts; progress covers both kinds', () => {
    const o = filterOptions(facts, DEFAULT_FILTERS, 'everything');
    expect(o.types).toEqual([
      { value: 'show', count: 2 },
      { value: 'anime', count: 1 },
      { value: 'movie', count: 1 },
    ]);
    expect(o.progress.map((x) => x.value)).toEqual(['watching', 'upToDate', 'watched']);
  });

  it('a show-only library has no Anime or Movies chip to promise', () => {
    expect(filterOptions([facts[0]], DEFAULT_FILTERS, 'everything').types.map((x) => x.value)).toEqual(['show']);
  });
});
