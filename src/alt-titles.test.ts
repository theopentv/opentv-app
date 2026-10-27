import { describe, expect, it } from '@jest/globals';

import { displayTitle, parseAltTitles } from '@/pure';

const ANGELS_EGG = JSON.stringify({ en: "Angel's Egg", orig: '\u5929\u4f7f\u306e\u305f\u307e\u3054' });
const RED_TURTLE = JSON.stringify({
  en: 'The Red Turtle',
  orig: 'La Tortue rouge',
  loc: '\u0627\u0644\u0633\u0644\u062d\u0641\u0627\u0629 \u0627\u0644\u062d\u0645\u0631\u0627\u0621',
});

describe('displayTitle', () => {
  it('shows the English title, not the stored original', () => {
    // The row is keyed by what the import wrote, which for this film is the
    // Japanese title. That is exactly the case the reader complained about.
    expect(displayTitle('\u5929\u4f7f\u306e\u305f\u307e\u3054', ANGELS_EGG)).toBe("Angel's Egg");
    expect(displayTitle('La Tortue rouge', RED_TURTLE)).toBe('The Red Turtle');
  });

  it("prefers the reader's language when the name was fetched in it", () => {
    // 27 Oct 2026: the reader's language first, English second.
    const red = JSON.stringify({ ...JSON.parse(RED_TURTLE), lang: 'ar', ol: 'fr' });
    expect(displayTitle('La Tortue rouge', red, 'ar')).toBe(
      '\u0627\u0644\u0633\u0644\u062d\u0641\u0627\u0629 \u0627\u0644\u062d\u0645\u0631\u0627\u0621',
    );
    // ar-IQ is still Arabic
    expect(displayTitle('La Tortue rouge', red, 'ar-IQ')).toBe(displayTitle('La Tortue rouge', red, 'ar'));
    // the same row for somebody reading English: English
    expect(displayTitle('La Tortue rouge', red, 'en')).toBe('The Red Turtle');
  });

  it('never shows a localised name in a language the reader left', () => {
    const red = JSON.stringify({ ...JSON.parse(RED_TURTLE), lang: 'ar' });
    expect(displayTitle('La Tortue rouge', red, 'fr')).toBe('The Red Turtle');
    // and a row from before `lang` was recorded says nothing about its language
    expect(displayTitle('La Tortue rouge', RED_TURTLE, 'ar')).toBe('The Red Turtle');
  });

  it("does not mistake TMDB's fallback to the original title for a translation", () => {
    // No Arabic title on TMDB: it answers with the Japanese original.
    const wolf = JSON.stringify({
      en: 'Wolf Children',
      orig: '\u304a\u304a\u304b\u307f\u3053\u3069\u3082\u306e\u96e8\u3068\u96ea',
      loc: '\u304a\u304a\u304b\u307f\u3053\u3069\u3082\u306e\u96e8\u3068\u96ea',
      lang: 'ar',
      ol: 'ja',
    });
    expect(displayTitle('\u304a\u304a\u304b\u307f\u3053\u3069\u3082\u306e\u96e8\u3068\u96ea', wolf, 'ar')).toBe('Wolf Children');
    // ...but a French film for a French reader is its own French title
    const fr = JSON.stringify({ en: 'The Red Turtle', orig: 'La Tortue rouge', loc: 'La Tortue rouge', lang: 'fr', ol: 'fr' });
    expect(displayTitle('The Red Turtle', fr, 'fr')).toBe('La Tortue rouge');
  });

  it('never returns nothing \u2014 an untranslated film keeps its stored name', () => {
    expect(displayTitle('Some Obscure Film', null)).toBe('Some Obscure Film');
    expect(displayTitle('Some Obscure Film', '{}')).toBe('Some Obscure Film');
  });

  it("survives the first version's unlabelled array without mislabelling it", () => {
    // The old shape stored a bag of strings with no idea which was English.
    // It must not be mistaken for a translation.
    expect(displayTitle('La Tortue rouge', '["The Red Turtle"]')).toBe('La Tortue rouge');
    expect(parseAltTitles('["The Red Turtle"]')).toEqual({ orig: 'The Red Turtle' });
  });

  it('ignores malformed JSON rather than throwing at render time', () => {
    expect(displayTitle('A Film', '{not json')).toBe('A Film');
  });

  it('keeps the localised name stored, so search can still find it', () => {
    // Not displayed, but not discarded: somebody who knows the film only by
    // its Arabic name must still be able to find it.
    expect(parseAltTitles(RED_TURTLE).loc).toBe(
      '\u0627\u0644\u0633\u0644\u062d\u0641\u0627\u0629 \u0627\u0644\u062d\u0645\u0631\u0627\u0621',
    );
  });
});
