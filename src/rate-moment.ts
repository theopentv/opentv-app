/**
 * WHEN A MARK IS A GOOD MOMENT TO ASK FOR A RATING — pure, so a test can run it
 * (`rate-us.ts` needs react-native).
 *
 * Two moments after a tap (2.0.3): a fresh library reaching 25 episodes (the
 * 1.x rule), and — for EVERYBODY, imported or not — the 10th episode marked by
 * hand in the app. The second exists because the import ask only ever reached
 * people who imported 50+ episodes after that code shipped; somebody who
 * imported in 1.x, or started small, was never asked at all (Play had 18
 * ratings on 25 Oct).
 *
 * COUNTED FROM THE MOMENT THIS SHIPS, not from the history: the count is a
 * meta counter bumped per tap, so a decade of imported watches does not make
 * the very first tap "the 10th". Once the 10-marks moment has been used it is
 * spent for good (`marksDone`), so a new version does not re-ask on its first
 * tap — the import and share asks still have their own once-per-version stamp.
 */
export const MARKS_MOMENT = 10;
export const FRESH_EPISODES = 25;

export function rateMomentAfterMark(p: {
  owner: 'seed' | 'imported' | 'fresh';
  /** every watch row in the library */
  total: number;
  /** episodes marked by hand since 2.0.3, this tap included */
  marks: number;
  /** the 10-marks moment has already been used */
  marksDone: boolean;
}): 'marks' | 'fresh' | null {
  if (p.owner === 'seed') return null;
  if (!p.marksDone && p.marks >= MARKS_MOMENT) return 'marks';
  if (p.owner === 'fresh' && p.total >= FRESH_EPISODES) return 'fresh';
  return null;
}
