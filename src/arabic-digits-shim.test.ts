import { AR_TAG, installArabicDigitsShim, toArabicDigits } from '@/arabic-digits-shim';

describe('arabic digits shim', () => {
  it('transliterates digits and the separators between them', () => {
    expect(toArabicDigits('390')).toBe('٣٩٠');
    expect(toArabicDigits('1,234.5')).toBe('١٬٢٣٤٫٥');
    expect(toArabicDigits('3.5 من 5')).toBe('٣٫٥ من ٥');
    expect(toArabicDigits('23 أكتوبر 2026')).toBe('٢٣ أكتوبر ٢٠٢٦');
  });

  it('leaves an engine that honours -u-nu-arab alone', () => {
    // node's ICU writes ١ for the tag, so nothing is patched
    expect((1).toLocaleString(AR_TAG)).toBe('١');
    expect(installArabicDigitsShim()).toBe(false);
  });

  it('patches an engine that ignores the extension (Hermes on iOS)', () => {
    const orig = Number.prototype.toLocaleString;
    const origDate = Date.prototype.toLocaleDateString;
    // simulate Hermes/iOS: the -u-nu extension is dropped
    Number.prototype.toLocaleString = function (this: number, l?: unknown, o?: unknown) {
      return orig.call(this, l === AR_TAG ? 'ar-u-nu-latn' : (l as string), o as Intl.NumberFormatOptions);
    } as typeof orig;
    try {
      expect(installArabicDigitsShim()).toBe(true);
      expect((390).toLocaleString(AR_TAG)).toBe('٣٩٠');
      expect((390).toLocaleString('en')).toBe('390');
    } finally {
      Number.prototype.toLocaleString = orig;
      Date.prototype.toLocaleDateString = origDate;
    }
  });
});
