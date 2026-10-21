/**
 * WHAT THE STORE WILL ACTUALLY CHARGE, as the plan card should say it.
 *
 * The paywall printed `priceString` and nothing else, so the day an Apple
 * introductory or win-back offer, or a Play offer, went live the card would
 * have said $19.99 while the store sheet said $9.99 (17 Oct, before Black
 * Friday). Every decision about which price to show lives here, pure, so it
 * can be tested against SDK-shaped data without a store.
 *
 * THE RULE: only a discount the store is going to apply. On iPhone that means
 * an introductory price only when RevenueCat says the person is ELIGIBLE
 * (unknown counts as no — the SDK's own advice), and a win-back offer only
 * when StoreKit listed it as eligible. On Android it means the DEFAULT option,
 * which is exactly what `purchasePackage` buys: Play lists only offers the
 * person qualifies for, and RevenueCat leaves `rc-ignore-offer` ones out of
 * the default, so a creator or personal offer never leaks to everybody.
 *
 * Types only from react-native-purchases: this file must load under Jest.
 */
import type { PricingPhase, PurchasesIntroPrice, PurchasesStoreProductDiscount, SubscriptionOption } from 'react-native-purchases';
import { intlTag } from '@/locale-resolve';

export type OfferUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
/** How long the offer price lasts, in the largest whole unit. */
export type OfferLasts = { unit: OfferUnit; count: number };

export type ShownOffer =
  | { kind: 'trial'; lasts: OfferLasts }
  | {
      kind: 'discount';
      /** The offer price, formatted by the store. */
      price: string;
      /** Set when the price is charged every month/year of the offer (Apple
       *  pay-as-you-go, Play recurring); null when it is one payment. */
      per: 'MONTH' | 'YEAR' | null;
      lasts: OfferLasts;
      /** Play's full price from the option itself; null on Apple, where the
       *  product's own `priceString` is the full price. */
      full: string | null;
    };

/** Apple's intro price and promotional / win-back discounts share this shape. */
export type AppleDiscount = Pick<
  PurchasesStoreProductDiscount | PurchasesIntroPrice,
  'price' | 'priceString' | 'cycles' | 'periodUnit' | 'periodNumberOfUnits'
>;

const UNITS: readonly string[] = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

/** "12 months" reads as "1 year", "14 days" as "2 weeks". */
function lasts(unit: OfferUnit, count: number): OfferLasts {
  if (unit === 'MONTH' && count % 12 === 0) return { unit: 'YEAR', count: count / 12 };
  if (unit === 'DAY' && count % 7 === 0) return { unit: 'WEEK', count: count / 7 };
  return { unit, count };
}

/**
 * One discounted stretch, from either store. Null whenever it cannot be said
 * honestly in "X for the first N, then Y" — the plain price is then shown,
 * which is never a promise the store breaks.
 */
function describe(o: {
  free: boolean;
  cheaper: boolean;
  price: string;
  unit: string;
  units: number;
  cycles: number;
  full: string | null;
}): ShownOffer | null {
  if (!UNITS.includes(o.unit) || o.units < 1 || o.cycles < 1) return null;
  const unit = o.unit as OfferUnit;
  const span = lasts(unit, o.units * o.cycles);
  if (o.free) return { kind: 'trial', lasts: span };
  if (!o.cheaper) return null;
  if (o.cycles === 1) return { kind: 'discount', price: o.price, per: null, lasts: span, full: o.full };
  // ponytail: "€0.99 every 2 months for 6 months" has no wording; shown as the
  // plain price. Add a sentence if a store offer is ever set up that way.
  if (o.units !== 1 || (unit !== 'MONTH' && unit !== 'YEAR')) return null;
  return { kind: 'discount', price: o.price, per: unit, lasts: span, full: o.full };
}

/** An Apple intro / promotional / win-back discount against the full price. */
export function fromApple(d: AppleDiscount, fullPrice: number): ShownOffer | null {
  return describe({
    free: d.price === 0,
    cheaper: d.price < fullPrice,
    price: d.priceString,
    unit: d.periodUnit,
    units: d.periodNumberOfUnits,
    cycles: d.cycles,
    full: null,
  });
}

/**
 * A Play option's FIRST phase against its LAST (the full price). A trial then
 * a discount says the trial: it is what happens first, and the wording for a
 * trial is the one that must never be wrong.
 */
export function fromPlay(phases: readonly PricingPhase[]): ShownOffer | null {
  if (phases.length < 2) return null;
  const first = phases[0]!;
  const full = phases[phases.length - 1]!;
  return describe({
    free: first.price.amountMicros === 0,
    cheaper: first.price.amountMicros < full.price.amountMicros,
    price: first.price.formatted,
    unit: first.billingPeriod.unit,
    units: first.billingPeriod.value,
    // Null for a single payment (NON_RECURRING): one period, paid once.
    cycles: first.billingCycleCount ?? 1,
    full: full.price.formatted,
  });
}

/**
 * What one plan card shows. `option` is a Play option the person chose by
 * other means (a creator code, a personal offer) and wins outright; `apple`
 * likewise for an Apple win-back or promotional discount. Otherwise: Apple's
 * intro price when eligible, or Play's default option.
 */
export function planOffer(input: {
  ios: boolean;
  product: { price: number; introPrice: PurchasesIntroPrice | null; defaultOption: SubscriptionOption | null };
  introEligible: boolean;
  apple?: AppleDiscount | null;
  option?: SubscriptionOption | null;
}): ShownOffer | null {
  const { ios, product } = input;
  if (input.option) return fromPlay(input.option.pricingPhases);
  if (ios) {
    if (input.apple) return fromApple(input.apple, product.price);
    return input.introEligible && product.introPrice ? fromApple(product.introPrice, product.price) : null;
  }
  return product.defaultOption ? fromPlay(product.defaultOption.pricingPhases) : null;
}

/** The Play option a personal offer names: `basePlan:offerId`, or a tag. */
export function matchPlayOption(options: readonly SubscriptionOption[] | null, offerId: string): SubscriptionOption | null {
  return options?.find((o) => !o.isBasePlan && (o.id.endsWith(`:${offerId}`) || o.tags.includes(offerId))) ?? null;
}

/** Whole seconds left on a personal offer; 0 once it has ended (or is unreadable). */
export function offerSecondsLeft(endsAt: string, nowMs: number): number {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) ? Math.max(0, Math.floor((end - nowMs) / 1000)) : 0;
}

/** 47:59:05 — hours run past 24 on purpose: "2 days" would hide that it is moving. */
export function formatCountdown(seconds: number, locale: string): string {
  const two = (n: number) => n.toLocaleString(intlTag(locale), { minimumIntegerDigits: 2, useGrouping: false });
  return `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
}
