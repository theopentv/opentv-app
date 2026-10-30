import { mergeBadges, parseBadge } from './badge-rules';

describe('parseBadge', () => {
  it('reads every shape in a real export, padded ids included', () => {
    expect(parseBadge('121361-marathoner-5-within-24-bd')).toMatchObject({ kind: 'marathoner', showId: 121361, count: 5, hours: 24, group: 'watch' });
    expect(parseBadge('121361-quick-watcher-3-bd')).toMatchObject({ kind: 'quick', showId: 121361, count: 3 });
    expect(parseBadge('serial-watcher-15-bd    ')).toMatchObject({ kind: 'serial', showId: null, count: 15 });
    expect(parseBadge('42-serial-actor-voter-10-bd')).toMatchObject({ kind: 'voter', group: 'ratings' });
    expect(parseBadge('42-serial-emotioner-5-bd')).toMatchObject({ kind: 'emoter', group: 'ratings' });
    expect(parseBadge('quizzer-25')).toMatchObject({ kind: 'quizzer', count: 25, group: 'app' });
    expect(parseBadge('show-off-2024')).toMatchObject({ kind: 'showoff', year: '2024' });
  });
  it('maps the export\'s names onto the fourteen, and a marathon counted here keeps its show name', () => {
    expect(parseBadge('viewed-profile')?.app).toBe('checked-user-profile');
    expect(parseBadge('reported-comment')?.app).toBe('reported-spoiler');
    expect(parseBadge('Game of Thrones-marathoner-3-within-24-bd')).toMatchObject({ showName: 'Game of Thrones', showId: null });
  });
  it('knows nothing about an id it has not seen', () => {
    expect(parseBadge('something-new')).toBeNull();
  });
});

describe('mergeBadges', () => {
  it('trims ids, keeps what it had, and the earliest date wins', () => {
    const out = mergeBadges([{ id: 'a', date: '2022-01-01' }], [
      { badge_id: 'a  ', created_at: '2020-05-05 10:00:00' },
      { badge_id: 'b', created_at: '2021-01-01 00:00:00' },
      { badge_id: '', created_at: 'x' },
    ]);
    expect(out).toEqual([{ id: 'a', date: '2020-05-05' }, { id: 'b', date: '2021-01-01' }]);
  });
});
