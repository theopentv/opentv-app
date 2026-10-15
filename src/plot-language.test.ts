import { firstPlot, pickBiography, plotTmdbLang, plotTvdbLangs, TVDB_LANG, tvdbHitName, tvdbLangChain } from '@/pure';

describe('plot language', () => {
  test('English setting asks for English only, whatever the app language', () => {
    expect(plotTvdbLangs('eng', 'it')).toEqual(['eng']);
    expect(plotTmdbLang('eng', 'ar')).toBeNull();
  });

  test('app language: own code first, English last', () => {
    expect(plotTvdbLangs('app', 'it')).toEqual(['ita', 'eng']);
    expect(plotTvdbLangs('app', 'ar')).toEqual(['ara', 'eng']);
    expect(plotTvdbLangs('app', 'fr')).toEqual(['fra', 'eng']);
    expect(plotTvdbLangs('app', 'es')).toEqual(['spa', 'eng']);
    expect(plotTmdbLang('app', 'it')).toBe('it');
  });

  test('Brazilian Portuguese: pt (Brazil) before por (Portugal) before English', () => {
    expect(plotTvdbLangs('app', 'pt-BR')).toEqual(['pt', 'por', 'eng']);
    expect(plotTmdbLang('app', 'pt-BR')).toBe('pt-BR');
  });

  test('an English app changes nothing', () => {
    expect(plotTvdbLangs('app', 'en')).toEqual(['eng']);
    expect(plotTmdbLang('app', 'en')).toBeNull();
    expect(plotTvdbLangs('app', 'xx')).toEqual(['eng']);
  });

  test('firstPlot skips missing and blank translations', () => {
    expect(firstPlot(null, '  ', 'English', 'original')).toBe('English');
    expect(firstPlot('Italiano', 'English')).toBe('Italiano');
    expect(firstPlot(undefined, '')).toBeNull();
  });

  test('German, Turkish and Polish use TheTVDB deu/tur/pol and TMDB de/tr/pl', () => {
    expect(plotTvdbLangs('app', 'de')).toEqual(['deu', 'eng']);
    expect(plotTvdbLangs('app', 'tr')).toEqual(['tur', 'eng']);
    expect(plotTvdbLangs('app', 'pl')).toEqual(['pol', 'eng']);
    expect(plotTmdbLang('app', 'de')).toBe('de');
    expect(plotTmdbLang('app', 'tr')).toBe('tr');
    expect(plotTmdbLang('app', 'pl')).toBe('pl');
  });
});

describe('TheTVDB language codes outside plots', () => {
  // 15 Oct: TVDB_LANG said pt → 'por', which is Portugal on TheTVDB; Brazil is 'pt'.
  test('Brazilian Portuguese is pt, with por before English', () => {
    expect(TVDB_LANG.pt).toBe('pt');
    expect(tvdbLangChain('pt-BR')).toEqual(['pt', 'por', 'eng']);
    expect(tvdbLangChain('en')).toEqual(['eng']);
  });

  test('a search hit falls back pt → por → eng → original', () => {
    const hit = { name: 'Breaking Bad', translations: { por: 'Breaking Bad: Ruptura Total', eng: 'Breaking Bad EN' } };
    expect(tvdbHitName(hit, 'pt')).toBe('Breaking Bad: Ruptura Total');
    expect(tvdbHitName({ ...hit, translations: { ...hit.translations, pt: 'Breaking Bad' } }, 'pt')).toBe('Breaking Bad');
    expect(tvdbHitName({ name: 'X', translations: { eng: 'Y' } }, 'deu')).toBe('Y');
  });

  test('a biography in the reader\'s language, then its sibling, then English, then any', () => {
    const bios = [
      { language: 'fra', biography: 'FR' },
      { language: 'eng', biography: 'EN' },
      { language: 'por', biography: 'PT-PT' },
      { language: 'deu', biography: 'DE' },
    ];
    expect(pickBiography(bios, 'de')).toBe('DE');
    expect(pickBiography(bios, 'pt-BR')).toBe('PT-PT');
    expect(pickBiography([...bios, { language: 'pt', biography: 'PT-BR' }], 'pt-BR')).toBe('PT-BR');
    expect(pickBiography(bios, 'pl')).toBe('EN');
    expect(pickBiography([{ language: 'fra', biography: 'FR' }], 'tr')).toBe('FR');
  });
});
