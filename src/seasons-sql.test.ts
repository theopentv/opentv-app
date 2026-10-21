import { DatabaseSync } from 'node:sqlite';

import { SEASONS_SQL } from '@/pure';

it('a season\'s watched count leaves out episode 0 (AoT "31 of 30")', () => {
  const d = new DatabaseSync(':memory:');
  d.exec('CREATE TABLE watches (showId INTEGER, season INTEGER, episode INTEGER, watchedAt TEXT)');
  const ins = d.prepare('INSERT INTO watches VALUES (?, ?, ?, ?)');
  for (let e = 0; e <= 30; e++) ins.run(1, 4, e, '2022-01-01');
  ins.run(1, 4, 5, '2023-01-01'); // a rewatch row is still one episode
  expect(d.prepare(SEASONS_SQL).all(1)).toEqual([{ season: 4, watched: 30, lastWatchedAt: '2023-01-01' }]);
});
