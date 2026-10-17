/**
 * The plan card must show what the store will charge — never a discount the
 * store will not apply, and never the full price over a discount it will.
 */
import type { PricingPhase, SubscriptionOption } from 'react-native-purchases';

import { formatCountdown, fromApple, fromPlay, matchPlayOption, offerSecondsLeft, planOffer } from './offers';

const phase = (formatted: string, micros: number, unit: string, value: number, cycles: number | null): PricingPhase =>
  ({
    billingPeriod: { unit, value, iso8601: '' },
    billingCycleCount: cycles,
    price: { formatted, amountMicros: micros, currencyCode: 'EUR' },
    recurrenceMode: null,
    offerPaymentMode: null,
  }) as unknown as PricingPhase;

const FULL_YEAR = phase('€19.99', 19_990_000, 'YEAR', 1, null);
const option = (id: string, phases: PricingPhase[], tags: string[] = [], isBasePlan = false): SubscriptionOption =>
  ({ id, pricingPhases: phases, tags, isBasePlan }) as unknown as SubscriptionOption;

const apple = (price: number, priceString: string, periodUnit: string, periodNumberOfUnits: number, cycles: number) => ({
  price,
  priceString,
  periodUnit,
  periodNumberOfUnits,
  cycles,
});

describe('Play phases', () => {
  it('a first year at half price', () => {
    expect(fromPlay([phase('€9.99', 9_990_000, 'YEAR', 1, 1), FULL_YEAR])).toEqual({
      kind: 'discount',
      price: '€9.99',
      per: null,
      lasts: { unit: 'YEAR', count: 1 },
      full: '€19.99',
    });
  });

  it('three months charged monthly, then the monthly price', () => {
    const full = phase('€2.49', 2_490_000, 'MONTH', 1, null);
    expect(fromPlay([phase('€1.24', 1_240_000, 'MONTH', 1, 3), full])).toMatchObject({
      per: 'MONTH',
      lasts: { unit: 'MONTH', count: 3 },
    });
  });

  it('twelve monthly cycles read as a year', () => {
    const full = phase('€2.49', 2_490_000, 'MONTH', 1, null);
    expect(fromPlay([phase('€0.99', 990_000, 'MONTH', 1, 12), full])?.lasts).toEqual({ unit: 'YEAR', count: 1 });
  });

  it('a free week is a trial', () => {
    expect(fromPlay([phase('Free', 0, 'DAY', 7, 1), FULL_YEAR])).toEqual({ kind: 'trial', lasts: { unit: 'WEEK', count: 1 } });
  });

  it('a base plan alone, or a "discount" that costs more, shows the plain price', () => {
    expect(fromPlay([FULL_YEAR])).toBeNull();
    expect(fromPlay([phase('€29.99', 29_990_000, 'YEAR', 1, 1), FULL_YEAR])).toBeNull();
  });

  it('a period it has no words for shows the plain price', () => {
    expect(fromPlay([phase('€0.99', 990_000, 'MONTH', 2, 3), FULL_YEAR])).toBeNull();
  });
});

describe('Apple discounts', () => {
  it('pay up front for three months', () => {
    expect(fromApple(apple(2.99, '$2.99', 'MONTH', 3, 1), 19.99)).toMatchObject({ price: '$2.99', per: null, lasts: { unit: 'MONTH', count: 3 } });
  });
  it('pay as you go', () => {
    expect(fromApple(apple(0.99, '$0.99', 'MONTH', 1, 3), 2.49)).toMatchObject({ per: 'MONTH', lasts: { unit: 'MONTH', count: 3 } });
  });
  it('free is a trial', () => {
    expect(fromApple(apple(0, '$0.00', 'WEEK', 1, 1), 19.99)?.kind).toBe('trial');
  });
});

describe('planOffer — only what the store will apply', () => {
  const intro = apple(9.99, '$9.99', 'YEAR', 1, 1);
  const ios = { price: 19.99, introPrice: { ...intro, period: 'P1Y' }, defaultOption: null };

  it('iPhone: the intro price only when eligible', () => {
    expect(planOffer({ ios: true, product: ios, introEligible: true })?.kind).toBe('discount');
    expect(planOffer({ ios: true, product: ios, introEligible: false })).toBeNull();
  });

  it('iPhone: a win-back offer wins over an intro the person cannot have anyway', () => {
    const shown = planOffer({ ios: true, product: ios, introEligible: false, apple: apple(4.99, '$4.99', 'YEAR', 1, 1) });
    expect(shown).toMatchObject({ price: '$4.99' });
  });

  it('Android: the default option, which is what purchasePackage buys', () => {
    const def = option('annual:intro', [phase('€9.99', 9_990_000, 'YEAR', 1, 1), FULL_YEAR]);
    expect(planOffer({ ios: false, product: { price: 19.99, introPrice: null, defaultOption: def }, introEligible: false })).toMatchObject({ price: '€9.99' });
    const base = option('annual', [FULL_YEAR], [], true);
    expect(planOffer({ ios: false, product: { price: 19.99, introPrice: null, defaultOption: base }, introEligible: false })).toBeNull();
  });

  it('a chosen option (creator code, personal offer) wins', () => {
    const def = option('annual', [FULL_YEAR], [], true);
    const creator = option('annual:creator', [phase('€9.99', 9_990_000, 'YEAR', 1, 1), FULL_YEAR], ['creator', 'rc-ignore-offer']);
    expect(planOffer({ ios: false, product: { price: 19.99, introPrice: null, defaultOption: def }, introEligible: false, option: creator })).toMatchObject({ price: '€9.99' });
  });
});

describe('personal offers', () => {
  const opts = [
    option('annual', [FULL_YEAR], [], true),
    option('annual:creator', [FULL_YEAR], ['creator']),
    option('annual:bf-2026', [FULL_YEAR], ['rc-ignore-offer']),
  ];
  it('finds the Play option by offer id or tag, never the base plan', () => {
    expect(matchPlayOption(opts, 'bf-2026')?.id).toBe('annual:bf-2026');
    expect(matchPlayOption(opts, 'creator')?.id).toBe('annual:creator');
    expect(matchPlayOption(opts, 'annual')).toBeNull();
    expect(matchPlayOption(null, 'x')).toBeNull();
  });

  it('counts down to the real end and stops at zero', () => {
    const now = Date.parse('2026-11-27T00:00:00.000Z');
    expect(offerSecondsLeft('2026-11-29T00:00:00.000Z', now)).toBe(48 * 3600);
    expect(offerSecondsLeft('2026-11-26T00:00:00.000Z', now)).toBe(0);
    expect(offerSecondsLeft('nonsense', now)).toBe(0);
    expect(formatCountdown(48 * 3600 - 55, 'en')).toBe('47:59:05');
    expect(formatCountdown(5, 'en')).toBe('00:00:05');
  });
});
