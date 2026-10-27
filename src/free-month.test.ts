import { freeMonthInviteDue, freeMonthReminderAt } from '@/free-month-rules';

const base = { signedIn: false, hadAccount: false, plus: false, available: true, customServer: false, declined: false };

describe('freeMonthInviteDue', () => {
  it('invites a phone with no account', () => {
    expect(freeMonthInviteDue(base)).toBe(true);
  });
  it.each([
    ['signed in', { signedIn: true }],
    ['once had an account here', { hadAccount: true }],
    ['already Plus', { plus: true }],
    ['a build that cannot sell Plus', { available: false }],
    ['a custom server', { customServer: true }],
    ['said No thanks', { declined: true }],
  ])('never when %s', (_, over) => {
    expect(freeMonthInviteDue({ ...base, ...over })).toBe(false);
  });
});

describe('freeMonthReminderAt', () => {
  const now = Date.parse('2026-10-27T10:00:00.000Z');
  it('is five days before the end: day 25 of 30', () => {
    expect(freeMonthReminderAt('2026-11-26T10:00:00.000Z', now)?.toISOString()).toBe('2026-11-21T10:00:00.000Z');
  });
  it('is nothing when that moment has passed, or the date is not one', () => {
    expect(freeMonthReminderAt('2026-10-30T10:00:00.000Z', now)).toBeNull();
    expect(freeMonthReminderAt('soon', now)).toBeNull();
  });
});
