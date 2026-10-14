import { firstPlot, plotTmdbLang, plotTvdbLangs } from '@/pure';

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
});
