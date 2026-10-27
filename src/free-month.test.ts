import {
  addFreeMonthUse,
  freeMonthEndDue,
  freeMonthInviteDue,
  freeMonthReminders,
  freeMonthUseOf,
} from '@/free-month-rules';

const base = {
  signedIn: false,
  server: '' as const,
  plus: false,
  available: true,
  customServer: false,
  declined: false,
};

describe('freeMonthInviteDue', () => {
  it('invites a phone with no account, which cannot hear the switch', () => {
    expect(freeMonthInviteDue(base)).toBe(true);
    expect(freeMonthInviteDue({ ...base, server: 'closed' })).toBe(true);
  });
  it('invites a signed-in account only once the server says open and unclaimed', () => {
    expect(freeMonthInviteDue({ ...base, signedIn: true, server: 'open' })).toBe(true);
    expect(freeMonthInviteDue({ ...base, signedIn: true, server: '' })).toBe(false);
    expect(freeMonthInviteDue({ ...base, signedIn: true, server: 'closed' })).toBe(false);
  });
  it('invites somebody whose earlier gifted Plus has ended (not Plus now, never claimed)', () => {
    expect(freeMonthInviteDue({ ...base, signedIn: true, server: 'open', plus: false })).toBe(true);
  });
  it.each([
    ['already claimed, signed in', { signedIn: true, server: 'claimed' as const }],
    ['claimed, then signed out', { server: 'claimed' as const }],
    ['Plus now (paid or a grant running)', { plus: true, signedIn: true, server: 'open' as const }],
    ['a build that cannot sell Plus', { available: false }],
    ['a custom server', { customServer: true }],
    ['said No thanks', { declined: true }],
  ])('never when %s', (_, over) => {
    expect(freeMonthInviteDue({ ...base, ...over })).toBe(false);
  });
});

describe('freeMonthReminders', () => {
  // Local dates, so the test holds in any time zone the runner is in.
  const local = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  const now = local(1, 9);

  it('is five days before the end, and 10:00 on the last day', () => {
    const until = new Date(local(26, 18)).toISOString();
    const r = freeMonthReminders(until, now);
    expect(r.fiveDays?.getTime()).toBe(local(21, 18));
    expect(r.lastDay?.getTime()).toBe(local(26, 10));
  });
  it('a month ending before ten is reminded the same morning, before it ends', () => {
    const r = freeMonthReminders(new Date(local(26, 6)).toISOString(), now);
    expect(r.lastDay?.getTime()).toBe(local(26, 3));
  });
  it('is nothing when a moment has passed, or the date is not one', () => {
    const r = freeMonthReminders(new Date(local(4, 18)).toISOString(), now);
    expect(r.fiveDays).toBeNull();
    expect(r.lastDay?.getTime()).toBe(local(4, 10));
    expect(freeMonthReminders(new Date(local(1, 12)).toISOString(), local(1, 11)).lastDay).toBeNull();
    expect(freeMonthReminders('soon', now)).toEqual({ fiveDays: null, lastDay: null });
  });
});

describe('freeMonthEndDue', () => {
  const end = {
    until: '2026-11-26T10:00:00.000Z',
    nowMs: Date.parse('2026-11-27T08:00:00.000Z'),
    shown: false,
    bought: false,
    plus: false,
    available: true,
    customServer: false,
  };
  it('is due at the first launch after the month passed', () => {
    expect(freeMonthEndDue(end)).toBe(true);
  });
  it('not while the month runs, and never twice', () => {
    expect(freeMonthEndDue({ ...end, nowMs: Date.parse('2026-11-26T09:00:00.000Z') })).toBe(false);
    expect(freeMonthEndDue({ ...end, shown: true })).toBe(false);
  });
  it('never to somebody who bought, or who is Plus some other way', () => {
    expect(freeMonthEndDue({ ...end, bought: true })).toBe(false);
    expect(freeMonthEndDue({ ...end, plus: true })).toBe(false);
  });
  it('never without a month this phone claimed', () => {
    expect(freeMonthEndDue({ ...end, until: null })).toBe(false);
    expect(freeMonthEndDue({ ...end, until: 'x' })).toBe(false);
    expect(freeMonthEndDue({ ...end, customServer: true })).toBe(false);
  });
});

describe('what the month was used for', () => {
  it('maps Plus gates onto the screen’s few lines, and ignores the rest', () => {
    expect(freeMonthUseOf('deep_stats')).toBe('stats');
    expect(freeMonthUseOf('icons')).toBe('themes');
    expect(freeMonthUseOf('profile_widgets')).toBe('profile');
    expect(freeMonthUseOf('filter_presets')).toBe('filters');
    expect(freeMonthUseOf('together')).toBeNull();
  });
  it('keeps the screen’s order without repeats', () => {
    expect(addFreeMonthUse('', 'filters')).toBe('filters');
    expect(addFreeMonthUse('filters', 'stats')).toBe('stats,filters');
    expect(addFreeMonthUse('stats,filters', 'stats')).toBe('stats,filters');
  });
});
