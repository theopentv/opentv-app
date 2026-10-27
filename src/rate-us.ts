/**
 * Asking to be rated, at the one moment somebody is actually pleased.
 *
 * WHY IT EXISTS: eight ratings and four written reviews after months on two
 * stores. Almost nobody rates an app they were never asked to rate, and that
 * listing is the first thing a TV Time refugee sees before they ever open it.
 *
 * THE NATIVE SHEET FIRST (2.0.0). `expo-store-review` draws Apple's and Play's
 * in-app control, so the reader rates with one tap and never leaves. It is
 * PINNED AT 57.0.1: 57.0.2 and 57.0.3 call `SceneGeometry.foregroundScene()`,
 * which expo-modules-core 57.0.1 doesn't have ("cannot find 'SceneGeometry' in
 * scope"). Unpin once expo-modules-core ships it. The OS decides whether the
 * sheet actually shows (Apple: three times a year at most), so it is asked for
 * directly, with no "do you like it?" in front of it. A build without the
 * module falls back to the old Alert that opens the store's review composer.
 *
 * THE MOMENT MATTERS MORE THAN THE WORDING. The best one is the import that
 * has just finished with a decade of history back on screen; the others are
 * the 10th episode marked here, a fresh library's 25th, and a shared Wrapped
 * card. Anywhere else is an interruption. Never on a failure, never mid-task, and
 * never before the library has anything in it.
 *
 * ASKED ONCE PER VERSION, AT MOST, and it is a question with a No in it. A
 * prompt that cannot be declined is a prompt that earns one-star reviews from
 * the exact people it interrupted.
 */
import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';


import { getMeta, libraryOwner, setMeta, watchCount } from '@/db';
import { currentLocale, t } from '@/i18n';
import { formatCount } from '@/locale-resolve';
import { FRESH_EPISODES, rateMomentAfterMark } from '@/rate-moment';
import { SIDELOADED } from '@/sideload';

type StoreReview = { isAvailableAsync(): Promise<boolean>; hasAction(): Promise<boolean>; requestReview(): Promise<void> };
let storeReview: StoreReview | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  storeReview = require('expo-store-review') as StoreReview;
} catch {
  storeReview = null;
}

const KEY = 'ratePromptedVersion';

/** Straight into the composer, not the listing. */
export const REVIEW_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/apps/details?id=com.insightfy.opentv'
    : 'https://apps.apple.com/app/id6787399404?action=write-review';

/** How much recovered history counts as a good moment. Below this the import
 *  was a trial run, and being asked to rate it is being asked about nothing. */
const ENOUGH_EPISODES = 50;

/** The native sheet if this build has it and the OS offers it; false means
 *  the caller should fall back to its own Alert. */
async function nativeAsk(): Promise<boolean> {
  try {
    if (!storeReview || !(await storeReview.isAvailableAsync()) || !(await storeReview.hasAction())) return false;
    await storeReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

/** Ask with the native sheet, or with the Alert + composer link where there is none. */
function ask(title: string, body: string): void {
  void nativeAsk().then((shown) => {
    if (shown) return;
    Alert.alert(title, body, [
      { text: t('rate.later'), style: 'cancel' },
      { text: t('rate.now'), onPress: () => void Linking.openURL(REVIEW_URL) },
    ]);
  });
}

export function ratePromptAlreadyShown(): boolean {
  const v = Constants.expoConfig?.version ?? '';
  return !!v && getMeta(KEY) === v;
}

/**
 * Ask, if this is a moment worth asking at. Silent and safe on every failure:
 * a rating prompt that throws would be a rating prompt that breaks an import.
 */
export function maybeAskForRating(episodesRecovered: number): void {
  try {
    if (episodesRecovered < ENOUGH_EPISODES) return;
    // Play only takes a rating from a copy it installed. The GitHub APK is
    // not one, so the ask would send its reader to a listing whose Install
    // button fails against this build's signature — see `sideload.ts`.
    if (SIDELOADED) return;
    if (ratePromptAlreadyShown()) return;
    /*
     * STAMPED BEFORE THE ASK. There is no answer to wait for — the reader may
     * tap Later, or leave for the store and never come back — and stamping
     * afterwards would re-ask on the next launch in both cases.
     */
    setMeta(KEY, Constants.expoConfig?.version ?? '');
    /*
     * GROUPED, LIKE EVERY OTHER COUNT IN THE APP. Raw interpolation printed
     * "4182" where the profile and the import summary both say "4,182" — and
     * the whole point of the sentence is that the number feels large.
     */
    ask(t('rate.title'), t(Platform.OS === 'android' ? 'rate.bodyAndroid' : 'rate.body', { count: formatCount(episodesRecovered, currentLocale()) }));
  } catch {
    // No store on this build, or a simulator. Both normal.
  }
}

const MARKS_KEY = 'rateMarkCount';
const MARKS_DONE_KEY = 'rateMarksMomentUsed';

/**
 * THE MOMENTS AFTER A TAP. Called once per mark from `mark.ts`, after any
 * "mark the earlier ones too?" alert has closed, so never on top of a dialog.
 * Counts the tap (the catch-up episodes that alert adds are setup, not use),
 * then asks if `rateMomentAfterMark` says this is the moment — the 10th
 * episode marked here, or a fresh library reaching 25. Once per version,
 * sharing the import's stamp.
 */
export function maybeAskForRatingAfterMark(): void {
  try {
    const marks = (Number(getMeta(MARKS_KEY)) || 0) + 1;
    setMeta(MARKS_KEY, String(marks));
    if (SIDELOADED || ratePromptAlreadyShown()) return;
    const n = watchCount();
    const moment = rateMomentAfterMark({ owner: libraryOwner(), total: n, marks, marksDone: getMeta(MARKS_DONE_KEY) === '1' });
    if (!moment) return;
    if (moment === 'marks') setMeta(MARKS_DONE_KEY, '1');
    setMeta(KEY, Constants.expoConfig?.version ?? '');
    ask(t('rate.freshTitle'), t('rate.freshBody', { count: formatCount(n, currentLocale()) }));
  } catch {
    // As above: never let a rating prompt break a mark.
  }
}

/**
 * THE THIRD MOMENT: a Wrapped card has just been shared, so the reader is
 * proud of their month. Native sheet only. An Alert straight after the share
 * sheet would be one dialog too many, so a build without the module asks
 * nothing here. Once per version, sharing the other two asks' stamp.
 */
export function maybeAskForRatingAfterShare(): void {
  try {
    if (SIDELOADED || ratePromptAlreadyShown() || watchCount() < FRESH_EPISODES) return;
    void nativeAsk().then((shown) => {
      if (shown) setMeta(KEY, Constants.expoConfig?.version ?? '');
    });
  } catch {
    // never let a rating prompt break a share
  }
}
