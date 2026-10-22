
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
