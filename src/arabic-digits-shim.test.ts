import { AR_TAG, installWesternDigitsShim, toWesternDigits } from '@/arabic-digits-shim';

describe('western digits shim', () => {
  it('transliterates Arabic-Indic digits and their separators', () => {
    expect(toWesternDigits('٣٩٠')).toBe('390');
    expect(toWesternDigits('١٬٢٣٤٫٥')).toBe('1,234.5');
    expect(toWesternDigits('٢٣ أكتوبر ٢٠٢٦')).toBe('23 أكتوبر 2026');
  });

  it('leaves an engine that honours -u-nu-latn alone', () => {
    expect((390).toLocaleString(AR_TAG)).toBe('390');
    expect(installWesternDigitsShim()).toBe(false);
  });

  it('patches an engine that ignores the extension', () => {
    const orig = Number.prototype.toLocaleString;
    // simulate an engine that drops -u-nu and writes Arabic-Indic for 'ar'
    Number.prototype.toLocaleString = function (this: number, l?: unknown, o?: unknown) {
      return orig.call(this, l === AR_TAG ? 'ar-u-nu-arab' : (l as string), o as Intl.NumberFormatOptions);
    } as typeof orig;
    try {
      expect(installWesternDigitsShim()).toBe(true);
      expect((390).toLocaleString(AR_TAG)).toBe('390');
      expect((390).toLocaleString('ar-u-nu-arab')).toBe('٣٩٠');
    } finally {
      Number.prototype.toLocaleString = orig;
    }
  });
});
