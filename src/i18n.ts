/**
 * The app's language.
 *
 * The decision of WHICH language is pure and lives in locale-resolve.ts, with
 * tests. This file is the part that cannot be unit-tested: it reads the phone,
 * reads the database, and asks React Native to mirror the layout.
 */
import * as Localization from 'expo-localization';
import { I18n, useMakePlural } from 'i18n-js';
import { ar as arPluralRule, fr as frPluralRule, pl as plPluralRule } from 'make-plural';
import { createElement, Fragment, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { I18nManager } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { isRtlLocale, resolveLocale, type Locale } from '@/locale-resolve';
import type { LocaleKey } from '@/locales/keys';
import { needsDirectionChange, plotTmdbLang, plotTvdbLangs, showEnumKey, type PlotLanguage } from '@/pure';

import ar from '@/locales/ar.json';
import de from '@/locales/de.json';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import it from '@/locales/it.json';
import pl from '@/locales/pl.json';
import ptBR from '@/locales/pt-BR.json';
import tr from '@/locales/tr.json';

const META_KEY = 'locale';

const i18n = new I18n({ en, ar, it, es, 'pt-BR': ptBR, fr, de, tr, pl });
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// The default pluralizer only distinguishes one/other, which is enough for
// en/it/es/pt-BR. Arabic legitimately needs all six CLDR categories (zero,
// one, two, few, many, other) — without this, e.g. count = 3 would fall
// through to whatever "other" form the JSON has, reading grammatically
// wrong. See make-plural's `ar` rule for the exact category boundaries.
i18n.pluralization.register('ar', useMakePlural({ pluralizer: arPluralRule }));

// French also needs its own rule: the default i18n-js table treats 0 as
// "zero"/"other", but real CLDR French puts 0 in "one" alongside 1 (0 and 1
// franc, but 2 francs) — get this wrong and "0 episode(s)" reads plural in a
// language where it shouldn't. make-plural's `fr` rule also has a "many"
// category for exact millions, which our locale files don't carry (no count
// in this app is ever an exact multiple of a million), so fr.json only uses
// one/other, same shape as it/es/pt-BR.
// useMakePlural is a plain factory function from i18n-js, not a React hook —
// same false positive already accepted for the 'ar' registration above.
// eslint-disable-next-line react-hooks/rules-of-hooks
i18n.pluralization.register('fr', useMakePlural({ pluralizer: frPluralRule }));

// Polish has three integer forms — 1 odcinek, 2–4 odcinki, 5–21 odcinków, and
// 22–24 back to odcinki — which the one/other default would read as "5
// odcinki", wrong for most counts. pl.json carries one/few/many plus `other`,
// which CLDR keeps for fractions; no count here is fractional today, but a
// missing `other` would print "[missing …]" the day one is. German and
// Turkish are one/other like English (Turkish keeps the noun singular after a
// number, so its two forms are usually the same text) and need no rule.
// eslint-disable-next-line react-hooks/rules-of-hooks
i18n.pluralization.register('pl', useMakePlural({ pluralizer: plPluralRule }));

let active: Locale = 'en';

/** The user's Settings choice, or null when following the phone. */
function storedOverride(): string | null {
  return getMeta(META_KEY);
}

/**
 * Normalise a BCP-47 tag into the canonical casing our locale files use:
 * lowercase language subtag, uppercase region subtag ("pt-br" and "PT-BR"
 * both become "pt-BR"). Some older Android versions hand expo-localization
 * a lowercase regional tag; resolveLocale matches case-sensitively on
 * purpose, so normalisation has to happen here, before the tag reaches it.
 */
function normalizeTag(tag: string): string {
  const [language, ...rest] = tag.split('-');
  if (rest.length === 0) return language.toLowerCase();
  return [language.toLowerCase(), ...rest.map((part) => part.toUpperCase())].join('-');
}

function deviceTags(): string[] {
  return Localization.getLocales().map((l) => normalizeTag(l.languageTag));
}

/**
 * Call once at startup, before the first render.
 *
 * Resolving the locale is only half the job: a phone already set to Arabic
 * resolves straight to 'ar' with no Settings visit needed, so the layout
 * direction has to be brought into line here too, not only in setLocale()
 * (which only runs from the language picker). Returns whether a mismatch was
 * found and corrected, so the caller can tell the user honestly that this
 * session may still be in the old direction — `forceRTL` is not guaranteed to
 * re-lay-out an already-running app, only the next launch. On every normal
 * launch the two already agree and this is a pure read, no write.
 */
export function initI18n(): boolean {
  active = resolveLocale(storedOverride(), deviceTags());
  i18n.locale = active;

  const mismatched = needsDirectionChange(isRtlLocale(active), I18nManager.isRTL);
  if (mismatched) {
    I18nManager.allowRTL(isRtlLocale(active));
    I18nManager.forceRTL(isRtlLocale(active));
  }
  return mismatched;
}

/**
 * Also the argument for upper-casing OUR words: `toUpperCase()` turns Turkish
 * "dizi" into "DIZI" — dotless I, a different letter — where Turkish writes
 * "DİZİ". Translated labels and dates shown in capitals use
 * `toLocaleUpperCase(currentLocale())`. Names that come from data (show titles,
 * characters, providers, handles) keep plain `toUpperCase()`: they are mostly
 * English, and the Turkish rule made the simulator read "TWİN PEAKS" (15 Oct).
 */
export function currentLocale(): Locale {
  return active;
}

/** Whether the user picked a language, as opposed to following the phone.
 * currentLocale() can't answer this — it returns the resolved locale either way. */
export function hasLocaleOverride(): boolean {
  return !!storedOverride();
}

/**
 * Change language. Pass null to go back to following the phone.
 *
 * Returns whether the app has to restart: React Native can only flip the layout
 * direction at startup, so crossing between Arabic and anything else needs a
 * relaunch. The caller is responsible for telling the user — silently doing
 * nothing is how a switch becomes a dead control.
 */
export function setLocale(locale: Locale | null): { needsRestart: boolean } {
  const next = resolveLocale(locale, deviceTags());
  const wasRtl = isRtlLocale(active);
  const willBeRtl = isRtlLocale(next);

  if (locale === null) {
    setMeta(META_KEY, '');
  } else {
    setMeta(META_KEY, locale);
  }

  active = next;
  i18n.locale = next;
  // The widgets print our words too, and nothing else rewrites them until the
  // app next goes to background. Required lazily: widget-sync → widget-data
  // reaches back into this module.
  void (require('@/widget-sync') as typeof import('@/widget-sync')).syncWidgets();
  // "The app's language" is the default plot language, so it moved too.
  if (plotLanguage() === 'app') plotsWanted();

  if (wasRtl !== willBeRtl) {
    I18nManager.allowRTL(willBeRtl);
    I18nManager.forceRTL(willBeRtl);
    return { needsRestart: true };
  }
  return { needsRestart: false };
}

/**
 * WHICH LANGUAGE A PLOT IS FETCHED IN: the app's (the default, stored as '')
 * or English. English is today's behaviour exactly — kept as a choice for
 * readers whose language TheTVDB translates badly, or who know a show by its
 * English synopsis. Only the plot follows it; titles never do, because search
 * and matching rely on them.
 */
const PLOT_KEY = 'plotLanguage';

export function plotLanguage(): PlotLanguage {
  return getMeta(PLOT_KEY) === 'eng' ? 'eng' : 'app';
}

export function setPlotLanguage(v: PlotLanguage): void {
  setMeta(PLOT_KEY, v === 'eng' ? 'eng' : '');
  plotsWanted();
}

/**
 * THE LIBRARY'S PLOTS ARE OWED AGAIN. `cacheAllShowMetadata` skips its whole
 * scan once `metaCacheComplete` is stamped, so a change of plot language must
 * clear the stamp or no cached plot is ever looked at again.
 */
function plotsWanted(): void {
  setMeta('metaCacheComplete', '');
}

/** TheTVDB translation codes to try for a plot, best first, always ending in `eng`. */
export function plotTvdbCodes(): string[] {
  return plotTvdbLangs(plotLanguage(), currentLocale());
}

/** TMDB `language=` for a plot, or null when English is what is wanted. */
export function plotTmdbCode(): string | null {
  return plotTmdbLang(plotLanguage(), currentLocale());
}

/** Look up a string. The key is typechecked against en.json. */
export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
  const out = i18n.t(key, vars);
  // ARABIC LINES ARE RIGHT-TO-LEFT EVEN WHEN THEY OPEN IN LATIN (12 Oct). A
  // line takes its direction from its first strong letter, so "OpenTV Backup
  // متوقف…" laid itself out left-to-right — aligned left, with "Plus." thrown
  // to the wrong end. An invisible right-to-left mark first settles it for
  // every string in one place.
  return i18n.locale === 'ar' && out && out[0] !== RLM ? RLM + out : out;
}
const RLM = '\u200F';

/**
 * "August 2026" in the reader's own language — the granularity a joined date
 * wants. A day number invites the arithmetic nobody was asking for, and the
 * month is the part that means "early" or "recently".
 */
export function monthYear(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
}

/**
 * SHOW STATUS AND GENRES ARE ENUMS, NOT NAMES (15 Oct). TheTVDB and TMDB send
 * "Ended", "Continuing", "Science Fiction" in English whatever the app speaks,
 * and the show page printed them as they came. Known values are looked up in
 * `showEnums` by their letters alone ("Sci-Fi & Fantasy" → `scififantasy`);
 * anything else — a value either database adds later, or a genre TMDB already
 * sent translated — is shown as it came rather than hidden.
 */
function enumText(group: 'status' | 'genre', raw: string): string {
  const key = showEnumKey(group, raw);
  return key in en.showEnums[group] ? t(`showEnums.${group}.${key}` as LocaleKey) : raw;
}

export const statusText = (raw: string): string => enumText('status', raw);
export const genreText = (raw: string): string => enumText('genre', raw);

/** A decimal in the app's language: "4.1" in English, "4,1" in Turkish, German,
 *  Polish, French… `toFixed` always wrote the English point (15 Oct). */
export function fmtDecimal(n: number, digits = 1): string {
  return n.toLocaleString(active, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** The app language, re-rendering the caller when it changes. For what stays
 *  mounted across a switch — the tab bar — which nothing else tells. */
export function useLocale(): Locale {
  return useSyncExternalStore((onChange) => i18n.onChange(onChange), currentLocale);
}

/**
 * STALE TEXT AFTER A LANGUAGE SWITCH (21 Oct). The React Compiler caches every
 * `t('literal')` forever — no argument ever changes — so a screen that stayed
 * mounted across the switch (a tab, the show page under Settings) kept the old
 * language: "Private" on the profile, "Notum / Özel not ekle" on a show.
 * Rather than un-memoise screens one at a time, both navigators wrap every
 * screen in this: a new locale is a new key, the screen remounts, and every
 * `t()` runs again. Navigation state lives in the navigator, so the stack and
 * the selected tab survive; only screen-local state (scroll, a draft) resets.
 */
function LocaleRemount({ children }: { children: ReactNode }) {
  return createElement(Fragment, { key: useLocale() }, children);
}

/** `screenLayout` for a navigator. `keep` names a route NOT to remount — one
 *  holding a nested navigator, whose remount would reset its state. */
export function remountOnLocale(keep?: string) {
  return function LocaleScreenLayout({ route, children }: { route: { name: string }; children: ReactElement }): ReactElement {
    return route.name === keep ? children : createElement(LocaleRemount, null, children);
  };
}
