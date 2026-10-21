/**
 * WESTERN DIGITS IN ARABIC, ON EVERY PHONE (21 Oct, Mahmood: "even in Arabic
 * the numbers should be like 390"). Plain 'ar' resolves differently per engine
 * — Hermes on iOS writes "390", Android's ICU writes "٣٩٠" — so one screen read
 * differently by phone. Every formatter asks for 'ar-u-nu-latn' (see intlTag in
 * locale-resolve.ts). An engine that drops the -u-nu extension and still writes
 * Arabic-Indic digits gets its toLocale*() results for that tag transliterated.
 *
 * Feature-detected, not platform-checked: an engine that already writes "1"
 * is left alone.
 */
export const AR_TAG = 'ar-u-nu-latn';

const ARABIC_INDIC = /[٠-٩]/g;

/** Arabic-Indic digits → Western; '٫' and '٬' → '.' and ','. */
export function toWesternDigits(s: string): string {
  return s
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

export function installWesternDigitsShim(): boolean {
  let ignored = false;
  try {
    ignored = (1).toLocaleString(AR_TAG) !== '1';
  } catch {
    return false;
  }
  if (!ignored) return false;

  type Fmt = (this: unknown, locales?: unknown, options?: unknown) => string;
  const wrap = (proto: object, name: string) => {
    const orig = (proto as Record<string, Fmt>)[name];
    (proto as Record<string, Fmt>)[name] = function (this: unknown, locales?: unknown, options?: unknown) {
      const out = orig.call(this, locales, options);
      return locales === AR_TAG ? toWesternDigits(out) : out;
    };
  };
  wrap(Number.prototype, 'toLocaleString');
  wrap(Date.prototype, 'toLocaleString');
  wrap(Date.prototype, 'toLocaleDateString');
  wrap(Date.prototype, 'toLocaleTimeString');
  return true;
}

installWesternDigitsShim();
