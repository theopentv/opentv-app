
describe('withGoalBlock', () => {
  const { withGoalBlock, defaultLayout } = require('./profile-layout') as typeof import('./profile-layout');
  it('puts the goal wide, right after the counts, once', () => {
    const out = withGoalBlock(defaultLayout(['shows']));
    const i = out.findIndex((p) => p.id === 'counts');
    expect(out[i + 1]).toMatchObject({ id: 'goal', span: '2x1' });
    expect(withGoalBlock(out).filter((p) => p.id === 'goal')).toHaveLength(1);
  });
  it('leaves a goal the owner placed where it is', () => {
    const mine = [{ uid: 'g', id: 'goal', span: '1x1' as const }, { uid: 'c', id: 'counts', span: '2x1' as const }];
    expect(withGoalBlock(mine)).toEqual(mine);
  });
});

describe('withPuzzleBlock', () => {
  const { withPuzzleBlock, withGoalBlock, defaultLayout } = require('./profile-layout') as typeof import('./profile-layout');
  it('puts the puzzle between Stats and Lists, once', () => {
    const out = withPuzzleBlock(defaultLayout(['shows']));
    const i = out.findIndex((p) => p.id === 'stats');
    expect(out[i + 1]).toMatchObject({ id: 'puzzle', span: '2x1' });
    expect(out[i + 2]).toMatchObject({ id: 'lists' });
    expect(withPuzzleBlock(out).filter((p) => p.id === 'puzzle')).toHaveLength(1);
  });
  it('keeps that place with the goal also on the page', () => {
    const ids = withGoalBlock(withPuzzleBlock(defaultLayout([]))).map((p) => p.id);
    expect(ids.slice(ids.indexOf('counts'), ids.indexOf('lists') + 1)).toEqual(['counts', 'goal', 'stats', 'puzzle', 'lists']);
  });
  it('falls back to before Lists, then the end, and leaves a placed puzzle alone', () => {
    const c = (id: string) => ({ uid: id, id, span: '2x1' as const });
    expect(withPuzzleBlock([c('counts'), c('lists')]).map((p) => p.id)).toEqual(['counts', 'puzzle', 'lists']);
    expect(withPuzzleBlock([c('counts')]).map((p) => p.id)).toEqual(['counts', 'puzzle']);
    const mine = [c('puzzle'), c('counts')];
    expect(withPuzzleBlock(mine)).toEqual(mine);
  });
});

describe('withTogetherBlock', () => {
  const { withTogetherBlock, withPuzzleBlock, defaultLayout, serialise, parseLayout } = require('./profile-layout') as typeof import('./profile-layout');
  const c = (id: string) => ({ uid: id, id, span: '2x1' as const });
  it('goes right after Stats, once', () => {
    const out = withTogetherBlock(defaultLayout(['shows']));
    const i = out.findIndex((p) => p.id === 'stats');
    expect(out[i + 1]).toMatchObject({ id: 'together', span: '2x1' });
    expect(withTogetherBlock(out).filter((p) => p.id === 'together')).toHaveLength(1);
  });
  it('sits after the puzzle when the puzzle is right after Stats', () => {
    const ids = withTogetherBlock(withPuzzleBlock(defaultLayout([]))).map((p) => p.id);
    expect(ids.slice(ids.indexOf('stats'), ids.indexOf('lists') + 1)).toEqual(['stats', 'puzzle', 'together', 'lists']);
  });
  it('falls back to before Lists, then the end, and leaves a placed one alone', () => {
    expect(withTogetherBlock([c('counts'), c('lists')]).map((p) => p.id)).toEqual(['counts', 'together', 'lists']);
    expect(withTogetherBlock([c('counts')]).map((p) => p.id)).toEqual(['counts', 'together']);
    const mine = [c('together'), c('counts')];
    expect(withTogetherBlock(mine)).toEqual(mine);
  });
  it('stays off a profile whose owner removed it', () => {
    // Drawn with the auto block, then removed in the first arrange: the save
    // remembers it was there, so it is not put back.
    const raw = serialise([c('stats')], null, ['stats', 'together']);
    const saved = parseLayout(raw)!;
    expect(withTogetherBlock(saved.items, saved.known).map((p) => p.id)).toEqual(['stats']);
  });
});

describe('widget gallery (2.0.3)', () => {
  const { availableToAdd, galleryGroups, galleryRows, WIDGET_NAME, specOf } = require('./profile-layout') as typeof import('./profile-layout');
  const keys = ['shows', 'fav-shows', 'movies', 'fav-movies'];
  const all = availableToAdd([], keys);

  it('offers no Everything widget: there is one Everything, the shelf (27 Oct)', () => {
    expect(all).not.toContain('everything');
    expect(all).not.toContain('shelf:everything');
    expect(WIDGET_NAME.everything).toBeUndefined();
    expect(specOf('shelf:everything')).toMatchObject({ private: true });
  });

  it('puts every widget the picker offers under exactly one heading', () => {
    const grouped = galleryGroups(all).flatMap((g) => g.ids);
    expect([...grouped].sort()).toEqual([...all].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('shelves sit under Shelves, in the library order; an unknown id falls into Stats', () => {
    const groups = galleryGroups([...all, 'fromTheFuture']);
    expect(groups.find((g) => g.group === 'shelves')!.ids.slice(0, 2)).toEqual(['shelf:shows', 'shelf:fav-shows']);
    expect(groups.find((g) => g.group === 'stats')!.ids).toContain('fromTheFuture');
  });

  it('pairs small squares and gives wide ones a row each', () => {
    expect(galleryRows(['since', 'genre', 'topRated', 'streak'])).toEqual([['since', 'genre'], ['topRated'], ['streak']]);
    expect(galleryRows(['since', 'topRated', 'streak'])).toEqual([['since', 'streak'], ['topRated']]);
  });
});

describe('Everything I watch is a shelf, placed by its switch (27 Oct)', () => {
  const { EVERYTHING_SHELF, defaultLayout, normalise, parseLayout, publishableWidgets, serialise, withEverythingShelf } =
    require('./profile-layout') as typeof import('./profile-layout');
  const keys = ['shows', 'fav-shows', 'movies', 'fav-movies'];
  const c = (id: string) => ({ uid: id, id, span: '2x1' as const });
  const ids = (xs: readonly { id: string }[]) => xs.map((p) => p.id);

  it('is not on any profile until switched on', () => {
    expect(ids(defaultLayout(keys))).not.toContain(EVERYTHING_SHELF);
    expect(ids(withEverythingShelf(defaultLayout(keys), false))).not.toContain(EVERYTHING_SHELF);
  });

  it('lands right above Shows, under Lists, on a fresh profile', () => {
    const out = ids(withEverythingShelf(defaultLayout(keys), true));
    const at = out.indexOf(EVERYTHING_SHELF);
    expect(out.slice(at - 1, at + 2)).toEqual(['lists', EVERYTHING_SHELF, 'shelf:shows']);
  });

  it('lands right above Shows on a saved layout that moved Shows', () => {
    const saved = normalise(parseLayout(serialise([c('banners'), c('shelf:movies'), c('lists'), c('shelf:shows'), c('extra')], null)), keys);
    const out = ids(withEverythingShelf(saved, true));
    expect(out.indexOf(EVERYTHING_SHELF)).toBe(out.indexOf('shelf:shows') - 1);
  });

  it('goes after Lists when Shows was removed', () => {
    const out = ids(withEverythingShelf([c('banners'), c('lists'), c('shelf:movies'), c('extra')], true));
    expect(out).toEqual(['banners', 'lists', EVERYTHING_SHELF, 'shelf:movies', 'extra']);
  });

  it('off takes it away wherever it was; on brings it back above Shows', () => {
    const moved = [c('banners'), c(EVERYTHING_SHELF), c('lists'), c('shelf:shows')];
    expect(ids(withEverythingShelf(moved, true))).toEqual(ids(moved));
    const off = withEverythingShelf(moved, false);
    expect(ids(off)).toEqual(['banners', 'lists', 'shelf:shows']);
    // Saved without it (the drawing is what gets saved), then switched back on.
    const reread = normalise(parseLayout(serialise(off, serialise(moved, null))), keys);
    expect(ids(reread)).not.toContain(EVERYTHING_SHELF);
    const back = ids(withEverythingShelf(reread, true));
    expect(back.indexOf(EVERYTHING_SHELF)).toBe(back.indexOf('shelf:shows') - 1);
  });

  it('is never published', () => {
    const out = publishableWidgets(withEverythingShelf(defaultLayout(keys), true), () => 1);
    expect(ids(out)).not.toContain(EVERYTHING_SHELF);
    expect(ids(out)).toContain('shelf:shows');
  });

  it('drops the old Everything widget from layouts saved with it', () => {
    const out = ids(normalise(parseLayout(serialise([c('banners'), c('everything'), c('lists')], null)), keys));
    expect(out).not.toContain('everything');
  });
});
