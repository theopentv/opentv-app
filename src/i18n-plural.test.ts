/**
 * Proves, at runtime, that Arabic plural selection actually works — not just
 * that the types compile. src/i18n.ts can't be imported directly here: it
 * pulls in expo-localization and react-native, neither of which run in this
 * plain-Node jest environment (see jest.config.js). So this test builds a
 * real I18n instance straight from i18n-js, using the exact ar.json data and
 * the exact Arabic pluralizer registration i18n.ts uses, and calls the real
 * translate/pluralize code path — the thing under doubt.
 */
import { I18n, useMakePlural } from 'i18n-js';
import { ar as arPluralRule, pl as plPluralRule } from 'make-plural';

import { localiseNumbers, type Locale } from './locale-resolve';
import ar from './locales/ar.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import pl from './locales/pl.json';

describe('Arabic plural selection at runtime', () => {
  const i18n = new I18n({ en, ar });
  i18n.enableFallback = true;
  i18n.defaultLocale = 'en';
  i18n.pluralization.register('ar', useMakePlural({ pluralizer: arPluralRule }));
  i18n.locale = 'ar';

  it('selects the CLDR category matching each count for stats.shows.onShows', () => {
    expect(i18n.t('stats.shows.onShows', { count: 1 })).toBe('على مسلسل واحد');
    expect(i18n.t('stats.shows.onShows', { count: 2 })).toBe('على مسلسلين');
    expect(i18n.t('stats.shows.onShows', { count: 3 })).toBe('على 3 مسلسلات');
    expect(i18n.t('stats.shows.onShows', { count: 11 })).toBe('على 11 مسلسلًا');
    expect(i18n.t('stats.shows.onShows', { count: 100 })).toBe('على 100 مسلسل');
  });

  it('selects the CLDR category matching each count for settings.app.reviewMatchedMoviesSub', () => {
    expect(i18n.t('settings.app.reviewMatchedMoviesSub', { count: 1 })).toBe(
      'فيلم واحد يشترك في الاسم مع فيلم آخر — تأكد أننا اخترنا الصحيح',
    );
    expect(i18n.t('settings.app.reviewMatchedMoviesSub', { count: 2 })).toBe(
      'فيلمان يشتركان في الاسم مع فيلمين آخرين — تأكد أننا اخترنا الصحيح',
    );
    expect(i18n.t('settings.app.reviewMatchedMoviesSub', { count: 3 })).toBe(
      '3 أفلام تشترك في الاسم مع أفلام أخرى — تأكد أننا اخترنا الصحيح',
    );
    expect(i18n.t('settings.app.reviewMatchedMoviesSub', { count: 11 })).toBe(
      '11 فيلمًا يشترك في الاسم مع أفلام أخرى — تأكد أننا اخترنا الصحيح',
    );
    expect(i18n.t('settings.app.reviewMatchedMoviesSub', { count: 100 })).toBe(
      '100 فيلم يشترك في الاسم مع أفلام أخرى — تأكد أننا اخترنا الصحيح',
    );
  });

  it('would pick the wrong form at count = 3 without the Arabic pluralizer registered', () => {
    // Regression guard for the exact bug this task fixes: the *default*
    // i18n-js pluralizer only knows one/other, so without registering the
    // CLDR-accurate `ar` rule, count = 3 falls into "other" instead of "few".
    const unregistered = new I18n({ en, ar });
    unregistered.enableFallback = true;
    unregistered.defaultLocale = 'en';
    unregistered.locale = 'ar';

    expect(unregistered.t('stats.shows.onShows', { count: 3 })).toBe('على 3 مسلسل');
    expect(unregistered.t('stats.shows.onShows', { count: 3 })).not.toBe(
      i18n.t('stats.shows.onShows', { count: 3 }),
    );
  });
});

describe('backup prompt counts its episodes (21 Oct: "Your 1 episodes")', () => {
  const i18n = new I18n({ en, ar });
  i18n.pluralization.register('ar', useMakePlural({ pluralizer: arPluralRule }));

  it('reads singular at 1 in English and Arabic', () => {
    i18n.locale = 'en';
    expect(i18n.t('backupPrompt.icloudBody', { count: 1 })).toMatch(/^Your 1 episode lives/);
    expect(i18n.t('backupPrompt.driveBody', { count: 2 })).toMatch(/^Your 2 episodes live/);
    i18n.locale = 'ar';
    expect(i18n.t('backupPrompt.driveBody', { count: 1 })).toMatch(/^حلقتك الوحيدة/);
    expect(i18n.t('backupPrompt.driveBody', { count: 2 })).toMatch(/^حلقتاك الاثنتان/);
  });
});

describe('the TV-time clock counts its units (21 Oct: "15 GODZINY")', () => {
  const i18n = new I18n({ en, pl });
  i18n.pluralization.register('pl', useMakePlural({ pluralizer: plPluralRule }));

  it('Polish one/few/many', () => {
    i18n.locale = 'pl';
    expect(i18n.t('stats.clock.hours', { count: 1 })).toBe('GODZINA');
    expect(i18n.t('stats.clock.hours', { count: 3 })).toBe('GODZINY');
    expect(i18n.t('stats.clock.hours', { count: 15 })).toBe('GODZIN');
    expect(i18n.t('stats.clock.months', { count: 22 })).toBe('MIESIĄCE');
  });

  it('English one/other', () => {
    i18n.locale = 'en';
    expect(i18n.t('stats.clock.days', { count: 1 })).toBe('DAY');
    expect(i18n.t('stats.clock.days', { count: 0 })).toBe('DAYS');
  });
});

describe('numbers in translated strings follow the locale (21 Oct: Western digits in Arabic)', () => {
  // Wired exactly as i18n.ts wires it. Jest's ICU writes 'ar' with Western
  // digits (see locale-resolve.test.ts), so the Arabic-Indic numbering system
  // is asked for explicitly here to make the digits visible.
  const make = (locale: string) => {
    const i18n = new I18n({ en, ar, fr });
    i18n.enableFallback = true;
    i18n.pluralization.register('ar', useMakePlural({ pluralizer: arPluralRule }));
    i18n.locale = locale.startsWith('ar') ? 'ar' : locale;
    const base = i18n.interpolate;
    i18n.interpolate = (self, message, options) => base(self, message, localiseNumbers(options, locale as Locale));
    return i18n;
  };

  it('formats {{count}} while plural selection still reads the raw number', () => {
    const i18n = make('ar-u-nu-arab');
    expect(i18n.t('yearlyGoal.behind', { count: 3 })).toBe('متأخّر بـ٣'); // few
    expect(i18n.t('yearlyGoal.behind', { count: 2 })).toBe('متأخّر باثنين'); // two
    expect(i18n.t('halfStars.value', { value: '٤٫٥', max: 5 })).toBe('٤٫٥ من ٥ نجوم');
  });

  it('writes the decimal mark of the language, and never groups a year', () => {
    const i18n = make('fr');
    expect(i18n.t('show.communityVotes', { avg: 4.5, count: 2, max: 5 })).toBe('OpenTV · 4,5/5 avec 2 votes');
    expect(localiseNumbers({ year: 2026, s: 'x' }, 'en')).toEqual({ year: '2026', s: 'x' });
  });

  it('carries no hard-coded star scale in any locale', () => {
    for (const d of [en, ar, fr]) {
      expect(d.halfStars.value).toContain('{{max}}');
      expect(d.halfStars.value).not.toMatch(/\b5\b/);
    }
  });
});
