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
import { ar as arPluralRule } from 'make-plural';

import ar from './locales/ar.json';
import en from './locales/en.json';

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
