/**
 * Naming the shows somebody else's comments are about.
 *
 * Pinned: a name costs a translation lookup, never a full show fetch; the
 * answer is remembered (meta + memory) and labels the card; an id asked about
 * once is not asked again this session, hit or miss.
 */
const meta = new Map<string, string>();
jest.mock('@/db', () => ({
  getMeta: (k: string) => meta.get(k) ?? null,
  setMeta: (k: string, v: string) => void meta.set(k, v),
  getMovies: () => [],
  getShowNames: () => [{ tvdbId: 1, name: 'Mine' }],
}));
jest.mock('@/metadata', () => ({ showMeta: () => undefined, episodeMeta: () => undefined }));
jest.mock('@/i18n', () => ({ t: (k: string) => k }));
jest.mock('@/pure', () => ({ slug: (s: string) => s }));
const tvdbTranslation = jest.fn(async (id: number) => (id === 75897 ? { name: 'The Simpsons', overview: null } : null));
const tvdbSeries = jest.fn(async () => null);
jest.mock('@/tvdb', () => ({ tvdbTranslation, tvdbSeries }));
jest.mock('@/tmdb', () => ({
  pool: async <T,>(items: T[], worker: (i: T) => Promise<unknown>) => {
    for (const i of items) await worker(i);
    return [];
  },
}));

import { resolveUnknownTargets, targetLabel } from './community-target';

const row = (key: string) => ({ target_source: 'tvdb' as const, target_key: key, season: 16, episode: 13 });

it('names an unknown show from its translation and remembers it', async () => {
  expect(targetLabel(row('75897'))).toBe('S16E13');
  expect(await resolveUnknownTargets([row('75897'), row('75897'), row('1')])).toBe(true);
  // one lookup: duplicates collapse and the library show is never asked about
  expect(tvdbTranslation).toHaveBeenCalledTimes(1);
  expect(meta.get('targetName:75897')).toBe('The Simpsons');
  expect(targetLabel(row('75897'))).toBe('The Simpsons S16E13');
});

it('does not ask about the same id twice in a session, hit or miss', async () => {
  tvdbTranslation.mockClear();
  expect(await resolveUnknownTargets([row('99')])).toBe(false);
  expect(tvdbSeries).toHaveBeenCalledTimes(1); // the fallback for a show with no English name
  expect(await resolveUnknownTargets([row('99'), row('75897')])).toBe(false);
  expect(tvdbTranslation).toHaveBeenCalledTimes(1);
});
