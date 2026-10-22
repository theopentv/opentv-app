import { tvdbHitName, tvdbNameRecord } from '@/pure';

// Shape of a live /series/431162/extended?meta=translations reply (22 Oct 2026).
const names = [
  { language: 'jpn', name: 'Kusuriya no Hitorigoto' },
  { language: 'jpn', name: '薬屋のひとりごと' },
  { language: 'eng', name: 'The Apothecary Diaries' },
  { language: 'ara', name: 'يوميات الصيدلانية' },
  { language: 'eng', name: "The Pharmacist's Monologue", isAlias: true },
];

describe('trending names', () => {
  it('names a card in the app language, English when there is none, never the original script', () => {
    const translations = tvdbNameRecord(names);
    expect(tvdbHitName({ name: '薬屋のひとりごと', translations }, 'eng')).toBe('The Apothecary Diaries');
    expect(tvdbHitName({ name: '薬屋のひとりごと', translations }, 'ara')).toBe('يوميات الصيدلانية');
    expect(tvdbHitName({ name: '薬屋のひとりごと', translations }, 'pol')).toBe('The Apothecary Diaries');
  });

  it('skips aliases and keeps the original when nothing is translated', () => {
    expect(tvdbNameRecord([{ language: 'eng', name: 'Alias', isAlias: true }])).toEqual({});
    expect(tvdbHitName({ name: '时光代理人', translations: tvdbNameRecord(undefined) }, 'eng')).toBe('时光代理人');
  });
});
