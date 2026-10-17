import { describe, expect, it } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';

import { SHOW_NAME_MISSING_WHERE } from '@/pure';

/**
 * WHICH SHOWS `fillMissingShowNames` OFFERS FOR REPAIR — run against real
 * SQLite (Node's built-in), not asserted as a string, because the whole point
 * is how SQLite compares an INTEGER id with a TEXT name.
 */
describe('SHOW_NAME_MISSING_WHERE', () => {
  const missing = (rows: [number, string | null, number?][]): number[] => {
    const d = new DatabaseSync(':memory:');
    d.exec('CREATE TABLE shows (tvdbId INTEGER PRIMARY KEY, name TEXT, nameTried INTEGER NOT NULL DEFAULT 0)');
    const ins = d.prepare('INSERT INTO shows (tvdbId, name, nameTried) VALUES (?, ?, ?)');
    for (const [id, name, tried] of rows) ins.run(id, name, tried ?? 0);
    return (d.prepare(`SELECT tvdbId FROM shows WHERE ${SHOW_NAME_MISSING_WHERE} ORDER BY tvdbId`).all() as { tvdbId: number }[]).map(
      (r) => r.tvdbId,
    );
  };

  it('catches blank names and a name that is the row\'s own id', () => {
    expect(missing([[1, null], [2, '  '], [78857, '78857'], [5, ' 5 ']])).toEqual([1, 2, 5, 78857]);
  });

  it('leaves real names alone, numeric ones included', () => {
    // "1899" and "1923" are real series; only equality with THIS id counts
    expect(missing([[350000, '1899'], [400000, '1923'], [10, 'Lost'], [78857, '078857'], [11, '78857']])).toEqual([]);
  });

  it('never re-asks about an id TheTVDB already answered for', () => {
    expect(missing([[78857, '78857', 1], [3, '', 1]])).toEqual([]);
  });
});
