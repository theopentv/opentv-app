/**
 * A flag on a show that isn't in the library must not become a sync op.
 *
 * The show page's ⋯ menu is offered on an untracked preview too. `setFollowing`
 * and its siblings ran an UPDATE that matched no row and then queued
 * `showFlag {followed:true}` anyway — so other devices were told to follow a
 * show nobody had added, while this device showed nothing at all.
 */
let changes = 0;
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    runSync: () => ({ changes, lastInsertRowId: 0 }),
    // the row probe `setShowFavorited` makes before it touches ranks
    getFirstSync: (sql: string) => (changes && sql.startsWith('SELECT 1 FROM shows') ? { 1: 1 } : null),
    getAllSync: () => [],
    withTransactionSync: (fn: () => void) => fn(),
  }),
}));

import { onLocalChange, setFollowing, setShowArchived, setShowFavorited, setShowFinished } from '@/db';

const setters = { setFollowing, setShowArchived, setShowFavorited, setShowFinished };

describe.each(Object.entries(setters))('%s', (_name, set) => {
  it('queues nothing for an untracked show', () => {
    changes = 0;
    const seen = jest.fn();
    const off = onLocalChange(seen);
    set(81189, true);
    off();
    expect(seen).not.toHaveBeenCalled();
  });

  it('still queues for a tracked one', () => {
    changes = 1;
    const seen = jest.fn();
    const off = onLocalChange(seen);
    set(81189, true);
    off();
    expect(seen).toHaveBeenCalled();
  });
});
