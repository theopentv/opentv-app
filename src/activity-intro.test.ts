import { activityBannerShown } from './activity-intro';

describe('activityBannerShown', () => {
  it('shows only to a member who has neither closed nor answered it', () => {
    expect(activityBannerShown({ member: true, closed: false, answered: false })).toBe(true);
    expect(activityBannerShown({ member: false, closed: false, answered: false })).toBe(false);
    expect(activityBannerShown({ member: true, closed: true, answered: false })).toBe(false);
    expect(activityBannerShown({ member: true, closed: false, answered: true })).toBe(false);
  });
});
