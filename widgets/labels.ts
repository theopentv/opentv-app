import { currentLocale, t } from '../src/i18n';

/**
 * THE WIDGETS' OWN WORDS, IN THE APP'S LANGUAGE (15 Oct). They were English
 * literals in every locale. Android draws its widgets in JS, so they call this
 * at render; iOS draws in SwiftUI from widget-data.json, so the same strings
 * ride along in that payload (`labels`) for the extension to read. Headings
 * are upper-cased here with the locale rule — a widget has no textTransform,
 * and Turkish "Sıradaki" must read SIRADAKİ.
 */
/** How far off an air date is, in words. Index = days from today. */
export function dayWords(): string[] {
  return Array.from({ length: 15 }, (_, d) =>
    d === 0 ? t('shows.today') : d === 1 ? t('shows.tomorrow') : t('widgets.inDays', { count: d }),
  );
}

export function widgetLabels() {
  const caps = (s: string) => s.toLocaleUpperCase(currentLocale());
  return {
    upNext: caps(t('widgets.upNext')),
    movies: caps(t('widgets.movies')),
    moviesToWatch: caps(t('widgets.moviesToWatch')),
    watching: caps(t('widgets.watching')),
    upcoming: caps(t('shows.tabs.upcoming')),
    nothingUpcoming: t('widgets.nothingUpcoming'),
    caughtUp: t('widgets.caughtUp'),
    watchlistEmpty: t('widgets.watchlistEmpty'),
    emptyHint: t('widgets.emptyHint'),
  };
}
