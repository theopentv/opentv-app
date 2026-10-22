/**
 * The 2.0.0 "New: Activity" notice on the Profile tab (22 Oct), and the meta
 * keys behind it. Modelled on the daily puzzle's banner + intro.
 *
 * Shown to community members only (Activity is a friends feed — nothing to
 * see without an account), until its ✕ is pressed or the intro screen has
 * been answered. Both are for good: it is news, said once.
 */
export const ACTIVITY_BANNER_CLOSED = 'activityBannerClosed';
export const ACTIVITY_INTRO_ANSWERED = 'activityIntroAnswered';

export function activityBannerShown(s: { member: boolean; closed: boolean; answered: boolean }): boolean {
  return s.member && !s.closed && !s.answered;
}
