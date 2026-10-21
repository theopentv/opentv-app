/**
 * Switching plot language: the library pass must look at the cached plots
 * again (it skips its whole scan while `metaCacheComplete` is stamped), and
 * an open show page must hear the new record land.
 */
const meta: Record<string, string> = { metaCacheComplete: '1' };
let wanted = 'eng';

jest.mock('@/db', () => ({
  __esModule: true,
  default: {},
  getAllShowIds: () => [1, 2],
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'US' }] }));
jest.mock('@/i18n', () => ({ plotTvdbCodes: () => [wanted, 'eng'], plotTmdbCode: () => null }));
jest.mock('@/tmdb', () => ({
  tmdb: async () => ({}),
  pool: async <T,>(items: T[], fn: (x: T) => Promise<unknown>) => {
    for (const x of items) await fn(x);
  },
}));
jest.mock('@/tvdb', () => ({}));

import { onShowMetaChange, registerShowMeta, type ShowMeta } from '@/metadata';
import { cacheAllShowMetadata } from '@/show-meta-fetch';

const rec = (plotLang: string): ShowMeta =>
  ({ tmdbId: 1, fetchedAt: Date.now(), name: 'X', seasons: { '1': { count: 1 } }, episodes: { '1-1': {} }, structureSource: 'tvdb', plotLang }) as unknown as ShowMeta;

it('an open page hears its show re-registered', () => {
  const heard: number[] = [];
  const off = onShowMetaChange((id) => heard.push(id));
  registerShowMeta(7, rec('eng'));
  off();
  registerShowMeta(7, rec('eng'));
  expect(heard).toEqual([7]);
});

it('a plot in the wrong language is owed again once the stamp is cleared', async () => {
  registerShowMeta(1, rec('eng'));
  registerShowMeta(2, rec('fra'));
  wanted = 'fra';
  meta.metaCacheComplete = ''; // what setPlotLanguage / setLocale do
  await cacheAllShowMetadata().catch(() => {});
  // Show 1 is English and French is wanted. Before the fix the pass saw two
  // shows with TheTVDB structure, found nothing to do and stamped complete.
  expect(meta.metaCacheComplete).toBe('');
});
