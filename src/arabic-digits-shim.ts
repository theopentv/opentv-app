/**
 * ARABIC-INDIC DIGITS WHERE THE ENGINE WON'T WRITE THEM (21 Oct). Every
 * formatter asks for 'ar-u-nu-arab' (see intlTag in locale-resolve.ts). Android's
 * ICU honours it; Hermes on iOS drops the -u-nu extension and writes "390", so
 * the same screen differed by phone. Where the engine ignores the request, the
 * toLocale*() results for that tag are transliterated after the fact.
 *
 * Feature-detected, not platform-checked: an engine that already writes "١"
 * is left alone.
 */
export const AR_TAG = 'ar-u-nu-arab';

const DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Western digits → Arabic-Indic; '.' and ',' between digits → '٫' and '٬'. */
export function toArabicDigits(s: string): string {
  return s
    .replace(/(\d)\.(?=\d)/g, '$1٫')
    .replace(/(\d),(?=\d)/g, '$1٬')
    .replace(/\d/g, (d) => DIGITS[Number(d)]);
}

export function installArabicDigitsShim(): boolean {
  let ignored = false;
  try {
    ignored = (1).toLocaleString(AR_TAG) === '1';
  } catch {
    return false;
  }
  if (!ignored) return false;

  type Fmt = (this: unknown, locales?: unknown, options?: unknown) => string;
  const wrap = (proto: object, name: string) => {
    const orig = (proto as Record<string, Fmt>)[name];
    (proto as Record<string, Fmt>)[name] = function (this: unknown, locales?: unknown, options?: unknown) {
      const out = orig.call(this, locales, options);
      return locales === AR_TAG ? toArabicDigits(out) : out;
    };
  };
  wrap(Number.prototype, 'toLocaleString');
  wrap(Date.prototype, 'toLocaleString');
  wrap(Date.prototype, 'toLocaleDateString');
  wrap(Date.prototype, 'toLocaleTimeString');
  return true;
}

installArabicDigitsShim();
