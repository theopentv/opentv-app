/**
 * RevenueCat — the only thing in the app allowed to answer "is this person Plus".
 *
 * It writes the answer through `setPlusEntitled()` in `@/plus`; every screen
 * reads it from there. Nothing else imports this module except the paywall and
 * the one `initPurchases()` call at launch.
 *
 * THREE THINGS THAT ARE NOT ACCIDENTS
 *
 * 1. The SDK is `require`d behind a try/catch, the same way `analytics.ts` does
 *    it. The native module only exists in a dev client or store build compiled
 *    with it; Jest and an older dev client must get a silent no-op rather than a
 *    crash at import time.
 *
 * 2. Empty keys mean "not configured yet", not "broken". `initPurchases()`
 *    returns immediately, every call below answers `unavailable`, and the
 *    paywall shows what Plus is with its buttons in an unavailable state. The
 *    whole Plus feature set can therefore be built and reviewed before a single
 *    store product exists.
 *
 * 3. Plus does NOT require a community account. The app's promise is that no
 *    account is needed, and a paid tier that quietly needed one would break it.
 *    So RC is configured with the community profile id when there is one — which
 *    is what carries a subscription across that person's devices — and with
 *    RC's own anonymous id when there is not. Somebody who joins later stays on
 *    the anonymous id for that launch; their receipt is still on the store
 *    account, so a restore recovers it either way.
 */
import { Platform } from 'react-native';
import type {
  CustomerInfo,
  IntroEligibility,
  PurchasesPackage,
  PurchasesPromotionalOffer,
  PurchasesStoreProduct,
  PurchasesStoreProductDiscount,
  PurchasesWinBackOffer,
  SubscriptionOption,
} from 'react-native-purchases';

import { getProfileId } from '@/community-session';
import { matchPlayOption, offerSecondsLeft } from '@/offers';
import { setStorePlus } from '@/plus';
import { annualSavingPercent, liveCreatorCode } from '@/pure';
import { RC_API_KEY_ANDROID, RC_API_KEY_IOS } from '@/rc-keys';
import { SIDELOADED } from '@/sideload';

/** The entitlement identifier to create in the RevenueCat dashboard. */
const ENTITLEMENT = 'plus';

/** The slice of the SDK this module uses. Typed so `any` never enters. */
type PurchasesSdk = {
  configure(config: { apiKey: string; appUserID?: string | null }): void;
  setLogHandler(handler: (level: string, message: string) => void): void;
  logIn(appUserID: string): Promise<{ customerInfo: CustomerInfo }>;
  addCustomerInfoUpdateListener(listener: (info: CustomerInfo) => void): void;
  getOfferings(): Promise<{
    current: { monthly: PurchasesPackage | null; annual: PurchasesPackage | null; metadata: Record<string, unknown> } | null;
  }>;
  purchasePackage(pkg: PurchasesPackage): Promise<{ customerInfo: CustomerInfo }>;
  purchaseSubscriptionOption(option: SubscriptionOption): Promise<{ customerInfo: CustomerInfo }>;
  setAttributes(attributes: Record<string, string | null>): void;
  restorePurchases(): Promise<CustomerInfo>;
  getCustomerInfo(): Promise<CustomerInfo>;
  // iOS only, all four (react-native-purchases 10.7 types).
  checkTrialOrIntroductoryPriceEligibility(productIds: string[]): Promise<Record<string, IntroEligibility>>;
  getEligibleWinBackOffersForPackage(pkg: PurchasesPackage): Promise<PurchasesWinBackOffer[] | undefined>;
  getPromotionalOffer(product: PurchasesStoreProduct, discount: PurchasesStoreProductDiscount): Promise<PurchasesPromotionalOffer | undefined>;
  purchaseDiscountedPackage(pkg: PurchasesPackage, discount: PurchasesPromotionalOffer): Promise<{ customerInfo: CustomerInfo }>;
  purchasePackageWithWinBackOffer(pkg: PurchasesPackage, offer: PurchasesWinBackOffer): Promise<{ customerInfo: CustomerInfo }>;
};

let sdk: PurchasesSdk | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sdk = (require('react-native-purchases') as { default: PurchasesSdk }).default;
} catch {
  sdk = null;
}

const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;

let configured = false;

/**
 * THE STORE IS ONE OF TWO SOURCES, and this used to behave as though it were
 * the only one.
 *
 * A subscription lives in the receipt, which is what makes this listener right
 * about cancellations, refunds and lapses — those must revoke, and only the
 * store knows. But Plus can also be GIVEN, straight onto `profiles`, and no
 * receipt exists for that. Setting the flag from `entitlements.active` alone
 * therefore un-entitled every gifted account a second or two after
 * `refreshSession` had entitled it.
 *
 * So: either source may grant, and revoking needs both to agree. `serverPlus`
 * is `null` when the server could not be asked, which falls back to the store
 * alone rather than pretending it said no — see the note on it in `plus.ts`.
 *
 * This is also what makes a grant with an END DATE work. `plus_until` lapses,
 * the next `/v1/me` answers false, the store still answers false, and the two
 * agreeing is what finally takes it off the phone.
 */
function applyEntitlement(info: CustomerInfo): void {
  const fromStore = info.entitlements.active[ENTITLEMENT] != null;
  setStorePlus(fromStore);
  void reportToServer(info, fromStore);
}

/**
 * TELL THE SERVER WHAT THE STORE SAID — the half that was missing on 3 Oct.
 *
 * A subscriber paid while RevenueCat still knew them only by an anonymous id,
 * so the webhook named nobody and the server never gave them Plus: Cloud
 * Backup and Sync refused a paying customer while this phone showed Plus.
 *
 * Two things go up, once per change (fingerprinted in meta):
 *  - the ANONYMOUS id the purchase may have been booked under
 *    (`originalAppUserId`), which the server keeps and attaches to this
 *    profile once — see `POST /v1/me/plus-check`;
 *  - whether the store says Plus, which the dashboard shows when it disagrees
 *    with the server. The server grants nothing because a phone said so.
 * Signed out: nothing is sent.
 */
async function reportToServer(info: CustomerInfo, fromStore: boolean): Promise<void> {
  try {
    const profileId = getProfileId();
    if (!profileId) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMeta, setMeta } = require('@/db') as typeof import('@/db');
    const anon = info.originalAppUserId?.startsWith('$RCAnonymousID:') ? info.originalAppUserId : null;
    const stamp = `${profileId}|${fromStore ? 1 : 0}|${anon ?? ''}|${new Date().toISOString().slice(0, 10)}`;
    if (getMeta('plusCheckSent') === stamp) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('@/api') as typeof import('@/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getToken, refreshSession } = require('@/community-session') as typeof import('@/community-session');
    const token = await getToken();
    if (!token) return;
    const res = await api<{ granted?: boolean }>('/v1/me/plus-check', {
      method: 'POST',
      token,
      body: { rc_ids: anon ? [anon] : [], device_plus: fromStore },
    });
    setMeta('plusCheckSent', stamp);
    // Newly granted on the server: read it back, so sync and backup open now.
    if (res?.granted) void refreshSession().catch(() => {});
  } catch {
    // Offline, or signed out mid-way. Tried again on the next change or day.
  }
}

/**
 * Called once, at launch. Safe to call again — the second call does nothing.
 * Never throws: a store that cannot be reached must not stop the app starting.
 */
export function initPurchases(): void {
  /*
   * THE GITHUB APK NEVER CONFIGURES THE STORE. It is signed with our own key,
   * not Play's, and Play Billing answers such a copy with a developer error at
   * the moment of purchase — after showing it the products. Left unconfigured,
   * every call below answers `unavailable`, the paywall shows the "it's in the
   * Play version" card (`sideload.*`), and the build makes no RevenueCat
   * request at all. A Plus the server granted still applies: `refreshSession`
   * sets it from `/v1/me`, which never went through here.
   */
  if (configured || !sdk || !apiKey || SIDELOADED) return;
  try {
    /*
     * A CANCELLED PURCHASE IS NOT AN ERROR, and the SDK logs it as one.
     *
     * Somebody tapping "cancel" on Apple's sheet is the most ordinary outcome
     * there is — `buy()` already returns `cancelled` and the paywall stays
     * quiet. But the SDK writes that through `console.error`, and in a debug
     * build LogBox turns every console.error into a full red screen. So
     * testing a purchase flow meant dismissing a crash-looking overlay each
     * time, and a real error would have been indistinguishable from it.
     *
     * Routed to `console.log` instead: nothing is hidden, and the one thing
     * LogBox exists to shout about stays meaningful.
     */
    try {
      sdk.setLogHandler((level, message) => {
        // eslint-disable-next-line no-console
        console.log(`[RevenueCat ${level}] ${message}`);
      });
    } catch {
      // An older SDK without a log handler. Noisy, never broken.
    }
    sdk.configure({ apiKey, appUserID: getProfileId() });
    configured = true;
    // The listener is the important half: it fires on launch, after a purchase,
    // after a restore, and when a subscription lapses or is refunded — so the
    // entitlement follows the store rather than the last thing the UI saw.
    sdk.addCustomerInfoUpdateListener(applyEntitlement);
    void sdk.getCustomerInfo().then(applyEntitlement).catch(() => {
      // Offline. The cached entitlement in meta stands, which is the point of
      // caching it — a bought app must be Plus on a plane.
    });
  } catch {
    configured = false;
  }
}

/**
 * Called when the community sign-in completes, for the device that joined
 * AFTER launch: `initPurchases` ran while signed out, so RevenueCat knows this
 * phone by an anonymous id, and a purchase made now would reach the webhook as
 * `$RCAnonymousID:…` — un-mappable, no badge, caps never lifted server-side.
 * `logIn` aliases the anonymous history onto the profile id, after which the
 * webhook can act. The entitlement itself never depended on this; it lives on
 * the store account and in the cached flag either way.
 *
 * Fire-and-forget and never throws: naming the buyer to the badge system must
 * not be able to break signing in.
 */
/**
 * NAME THE BUYER. Called the moment somebody signs in — not only when they
 * finish joining, which is all it used to wait for. RevenueCat is configured
 * at launch with whoever was signed in THEN; somebody who signs in later in
 * the same session and buys before the app restarts was buying anonymously.
 */
export function logInPurchases(profileId: string): void {
  if (!configured || !sdk) return;
  sdk
    .logIn(profileId)
    .then(({ customerInfo }) => applyEntitlement(customerInfo))
    .catch(() => {
      // Offline or RC hiccup. The webhook maps this profile on the next
      // launch's configure(), so nothing is lost — only delayed.
    });
}

/** The two packages the paywall offers. Either may be null. `metadata` is the
 *  offering's own, set in the RevenueCat dashboard — see `creatorOffer`. */
export type Plans = { monthly: PurchasesPackage | null; annual: PurchasesPackage | null; metadata?: Record<string, unknown> };

/**
 * Every call below returns a result instead of throwing. The UI has exactly
 * three things to say — it worked, you cancelled, it did not work — and a raw
 * StoreKit error string is not one of them.
 */
export type PurchaseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed' };

const unavailable = { ok: false, reason: 'unavailable' } as const;

export async function getOffering(): Promise<PurchaseResult<Plans>> {
  if (!sdk || !configured) return unavailable;
  try {
    const current = (await sdk.getOfferings()).current;
    if (!current) return unavailable;
    return { ok: true, value: { monthly: current.monthly, annual: current.annual, metadata: current.metadata } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * CREATOR CODES — a podcast's listeners get Plus at a discount.
 *
 * TWO STORES, TWO MECHANISMS, one code said out loud.
 *  - iPhone: Apple's own offer codes. Redeemed on Apple's sheet (or the link
 *    in the show notes); the app only opens the sheet. Apple forbids an app
 *    unlocking a price with a code of its own (guideline 3.1.1).
 *  - Android: Play promo codes only give free days, so the discount is a
 *    DEVELOPER-DETERMINED offer on each base plan, tagged `creator` and
 *    `rc-ignore-offer`. The second tag matters: without it RevenueCat's
 *    default option would hand the discount to everybody. The code itself is
 *    checked against the offering's metadata (`liveCreatorCode`), so it is
 *    started and ended from the RevenueCat dashboard, never by a release.
 *
 * Nothing here talks to our server — Plus never needs an account.
 */
export function creatorOffer(pkg: PurchasesPackage | null): SubscriptionOption | null {
  return pkg?.product.subscriptionOptions?.find((o) => o.tags.includes('creator')) ?? null;
}

/** The canonical code when it is live and a plan carries the offer, else null. */
export function checkCreatorCode(plans: Plans, typed: string): string | null {
  if (Platform.OS !== 'android') return null;
  if (!creatorOffer(plans.monthly) && !creatorOffer(plans.annual)) return null;
  return liveCreatorCode(plans.metadata, typed, new Date().toISOString().slice(0, 10));
}

/**
 * iPhone: Apple's redeem page with the code already in it.
 *
 * NOT `presentCodeRedemptionSheet` (8 Oct). That StoreKit 1 sheet showed
 * nothing on a real iPhone — no error either, so the button just did nothing.
 * The redeem URL is the same one the show notes use: it opens the App Store's
 * own sheet with the offer named, and it works from any build. Nothing is
 * checked here — Apple owns the codes on iOS and says whether one is valid.
 */
export function appleRedeemUrl(typed: string): string | null {
  const code = typed.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code ? `https://apps.apple.com/redeem?ctx=offercodes&id=6787399404&code=${code}` : null;
}

/**
 * WHAT APPLE WILL DISCOUNT FOR THIS PERSON, per plan — see `planOffer` in
 * offers.ts for how the card turns it into words.
 *
 * `introEligible` is RevenueCat's answer, and only ELIGIBLE counts: UNKNOWN
 * (no subscription group info yet) shows the plain price, as the SDK itself
 * advises — a card promising $9.99 to somebody StoreKit then charges $19.99
 * is the one outcome this exists to stop. `winBack` is StoreKit 2's own list
 * of win-back offers this person qualifies for (iOS 18+; older answers
 * nothing, and so does a throw).
 *
 * Android needs none of this: Play only lists offers the person qualifies
 * for, and the default option already says which one `purchasePackage` buys.
 */
export type AppleExtras = { introEligible: boolean; winBack: PurchasesWinBackOffer | null };
const NO_EXTRAS: AppleExtras = { introEligible: false, winBack: null };

export async function appleExtras(plans: Plans): Promise<{ annual: AppleExtras; monthly: AppleExtras }> {
  const none = { annual: NO_EXTRAS, monthly: NO_EXTRAS };
  if (Platform.OS !== 'ios' || !sdk || !configured) return none;
  const s = sdk;
  const ids = [plans.annual, plans.monthly].flatMap((p) => (p ? [p.product.identifier] : []));
  // 2 = INTRO_ELIGIBILITY_STATUS_ELIGIBLE. The enum is a runtime value of the
  // native module, which this file only `require`s behind a try.
  const eligible = await s.checkTrialOrIntroductoryPriceEligibility(ids).catch(() => ({}) as Record<string, IntroEligibility>);
  const one = async (pkg: PurchasesPackage | null): Promise<AppleExtras> => {
    if (!pkg) return NO_EXTRAS;
    const winBack = await s.getEligibleWinBackOffersForPackage(pkg).then((w) => w?.[0] ?? null, () => null);
    return { introEligible: eligible[pkg.product.identifier]?.status === 2, winBack };
  };
  const [annual, monthly] = await Promise.all([one(plans.annual), one(plans.monthly)]);
  return { annual, monthly };
}

/**
 * A PERSONAL OFFER, given from the dashboard (`GET /v1/me/offer`), matched to
 * the store offer that will honour it — or null, and the normal paywall.
 *
 * ONLY A PHONE WITH AN ACCOUNT ASKS. No profile id, no request: somebody who
 * never joined must never contact the server, and nothing here changes that.
 *
 * NULL WHENEVER THE STORE WOULD NOT HONOUR IT, so the card is never a promise
 * the sheet breaks:
 *  - iPhone: the offer id must be one of the product's promotional offers, and
 *    RevenueCat must SIGN it (`getPromotionalOffer`), which needs the In-App
 *    Purchase key uploaded to RevenueCat. No key, no signature, no card.
 *    ponytail: the signature is fetched once per paywall open; Apple accepts
 *    it for 24 hours, far longer than anybody keeps the sheet open.
 *  - Android: an option on the product whose offer id or tag is that id.
 *    Play lists it only if the person qualifies.
 * The annual plan is tried first.
 */
export type PersonalOffer = {
  pkg: PurchasesPackage;
  endsAt: string;
  /** iPhone: the discount (for the price) and its signature (to buy it). */
  apple: { discount: PurchasesStoreProductDiscount; signed: PurchasesPromotionalOffer } | null;
  /** Android: the option to buy. */
  option: SubscriptionOption | null;
};

export async function getPersonalOffer(plans: Plans): Promise<PersonalOffer | null> {
  if (!sdk || !configured || !getProfileId()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('@/api') as typeof import('@/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getToken } = require('@/community-session') as typeof import('@/community-session');
    const token = await getToken();
    if (!token) return null;
    const res = await api<{ offer: { offer_id: string; ends_at: string } | null }>('/v1/me/offer', { token });
    const offer = res?.offer;
    if (!offer || offerSecondsLeft(offer.ends_at, Date.now()) === 0) return null;
    for (const pkg of [plans.annual, plans.monthly]) {
      if (!pkg) continue;
      if (Platform.OS === 'ios') {
        const discount = pkg.product.discounts?.find((d) => d.identifier === offer.offer_id);
        if (!discount) continue;
        const signed = await sdk.getPromotionalOffer(pkg.product, discount).catch(() => undefined);
        if (signed) return { pkg, endsAt: offer.ends_at, apple: { discount, signed }, option: null };
      } else {
        const option = matchPlayOption(pkg.product.subscriptionOptions, offer.offer_id);
        if (option) return { pkg, endsAt: offer.ends_at, apple: null, option };
      }
    }
    return null;
  } catch {
    // Offline, signed out, or the server is older than this build: no card.
    return null;
  }
}

/** Bought through it, so it is spent — the server stops offering it. */
function spendPersonalOffer(): void {
  void (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('@/api') as typeof import('@/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getToken } = require('@/community-session') as typeof import('@/community-session');
    const token = await getToken();
    if (token) await api('/v1/me/offer/used', { method: 'POST', token, body: {} });
  })().catch(() => {
    // It ends on its own at ends_at anyway.
  });
}

/**
 * HOW to buy a package. Nothing: the default, which on iPhone applies any
 * intro price StoreKit decides on and on Android buys the default option.
 * `code`: the creator offer (Android). `winBack`: Apple's win-back offer.
 * `personal`: the dashboard's offer, through the store offer it names.
 */
export type BuyVia = { code?: string | null; winBack?: PurchasesWinBackOffer | null; personal?: PersonalOffer | null };

/**
 * `value` is whether the entitlement is active afterwards. With a `code`, the
 * creator offer is bought instead of the default, and the code is put on the
 * RevenueCat customer — that is how a creator's listeners are counted.
 */
export async function buy(pkg: PurchasesPackage, via: BuyVia = {}): Promise<PurchaseResult<boolean>> {
  if (!sdk || !configured) return unavailable;
  try {
    const { code, winBack, personal } = via;
    const offer = code ? creatorOffer(pkg) : null;
    if (offer) sdk.setAttributes({ creator_code: code! });
    const { customerInfo } = personal?.apple
      ? await sdk.purchaseDiscountedPackage(pkg, personal.apple.signed)
      : personal?.option
        ? await sdk.purchaseSubscriptionOption(personal.option)
        : offer
          ? await sdk.purchaseSubscriptionOption(offer)
          : winBack
            ? await sdk.purchasePackageWithWinBackOffer(pkg, winBack)
            : await sdk.purchasePackage(pkg);
    applyEntitlement(customerInfo);
    const active = customerInfo.entitlements.active[ENTITLEMENT] != null;
    if (active && personal) spendPersonalOffer();
    return { ok: true, value: active };
  } catch (e) {
    // RC signals a cancelled sheet with a flag on the error, not a distinct
    // type. Cancelling is not a failure and must not raise an alert.
    if (typeof e === 'object' && e !== null && (e as { userCancelled?: boolean }).userCancelled === true) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'failed' };
  }
}

/**
 * What a subscriber's subscription is actually doing.
 *
 * WHY THIS EXISTS. The paid screen said "thank you" and nothing else, so
 * somebody paying had no way to see when they would be charged again, or
 * whether they would be — which is the single most common reason people cancel
 * a subscription they would otherwise have kept: not knowing.
 *
 * `willRenew` IS THE IMPORTANT FIELD, not the date. The same date means
 * "renews on" or "ends on" depending on it, and those are opposite sentences.
 * A cancelled subscriber still has Plus until the date, and telling them it
 * renews then would be a lie they discover at the wrong moment.
 *
 * `managementURL` is Apple's own subscription screen. Cancelling must never be
 * something this app makes hard to find: Apple requires the route to exist, and
 * hiding it is how a tier earns refund requests instead of renewals.
 *
 * Null when there is nothing to say — not configured, not subscribed, or the
 * call failed. Every caller treats all three the same way.
 */
export type PlusStatus = {
  /** ISO date the period ends. Null for a lifetime or a sandbox oddity. */
  expires: string | null;
  /** True: charged again on that date. False: access ends on it. */
  willRenew: boolean;
  /** Apple's manage-subscription page for this account. */
  managementUrl: string | null;
  /** True while in a free trial, which changes what the date means again. */
  trial: boolean;
};

/**
 * WHERE TO CANCEL — a URL that always exists.
 *
 * `plusStatus()` carries RevenueCat's own `managementURL`, which is the better
 * answer when it is there: on iOS it deep-links to this subscription rather
 * than the list. But it is null in three ordinary cases — the SDK not
 * configured, the network call failing, no active entitlement — and the
 * screen that showed it simply rendered nothing in all three. Somebody on a
 * bad connection was left with no way out at all, which is exactly the
 * outcome the comment on `PlusStatus` says must never happen.
 *
 * So the store's own page is the floor. Both of these are public, documented
 * and work with no SDK involved: a person who wants to stop paying can always
 * get to the screen that stops it.
 */
export function manageSubscriptionUrl(managementUrl?: string | null): string {
  if (managementUrl) return managementUrl;
  return Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
}

export async function plusStatus(): Promise<PlusStatus | null> {
  if (!sdk || !configured) return null;
  try {
    const info = await sdk.getCustomerInfo();
    const ent = info.entitlements.active[ENTITLEMENT];
    if (!ent) return null;
    return {
      expires: ent.expirationDate,
      willRenew: ent.willRenew,
      managementUrl: info.managementURL,
      trial: ent.periodType === 'TRIAL' || ent.periodType === 'trial',
    };
  } catch {
    return null;
  }
}

/** `value` is whether anything was restored. */
export async function restore(): Promise<PurchaseResult<boolean>> {
  if (!sdk || !configured) return unavailable;
  try {
    const info = await sdk.restorePurchases();
    applyEntitlement(info);
    return { ok: true, value: info.entitlements.active[ENTITLEMENT] != null };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The annual saving as a whole percent, or null. Maths in `pure.ts`, tested. */
export function annualSaving(plans: Plans): number | null {
  return annualSavingPercent(plans.monthly?.product.price, plans.annual?.product.price);
}
