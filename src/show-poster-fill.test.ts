/**
 * fillMissingShowPosters (2.0.3, u/azz922): TMDB is asked before a show is
 * given up on, a miss is only remembered when both answered, and one show's
 * failure does not stop the rest.
 */
const meta: Record<string, string> = {};
const posters: Record<number, string> = {};

jest.mock('@/db', () => ({
  __esModule: true,
  default: {},
  getShowsMissingPoster: () => [{ tvdbId: 1 }, { tvdbId: 2 }, { tvdbId: 3 }, { tvdbId: 4 }],
  getMeta: (k: string) => meta[k] ?? null,
  setMeta: (k: string, v: string) => void (meta[k] = v),
  setShowPoster: (id: number, url: string) => void (posters[id] = url),
  setShowBackdrop: () => {},
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'US' }] }));
jest.mock('@/i18n', () => ({ plotTvdbCodes: () => ['eng'], plotTmdbCode: () => null }));
jest.mock('@/tmdb', () => ({
  // 2: TMDB has a poster. 3: TMDB has none. 4: TMDB unreachable.
  tmdb: async (path: string) => {
    if (path.includes('/find/2')) return { tv_results: [{ poster_path: '/two.jpg' }] };
    if (path.includes('/find/3')) return { tv_results: [] };
    throw new Error('offline');
  },
  pool: jest.requireActual('@/tmdb').pool,
}));
jest.mock('@/tvdb', () => ({
  // 1 throws (a bad answer must cost one show, not the loop); the rest answer with no image
  tvdbSeries: async (id: number) => {
    if (id === 1) throw new Error('boom');
    return { image: null };
  },
  tvdbSeriesBackground: async () => null,
}));

import { fillMissingShowPosters } from '@/show-meta-fetch';

it('falls back to TMDB, remembers only a double miss, survives a throw', async () => {
  await fillMissingShowPosters();
  expect(posters[2]).toBe('https://image.tmdb.org/t/p/w500/two.jpg');
  expect(meta['showPosterMiss:3']).toBe('1');
  expect(meta['showPosterMiss:4']).toBeUndefined();
  expect(meta['showPosterMiss:1']).toBeUndefined();
});
