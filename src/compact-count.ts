import { intlTag } from '@/locale-resolve';
/**
 * "83,4K" in Italian, "83.4K" in English (21 Oct): the K/M labels were built
 * with `toFixed`, which always writes the English point. Not `notation:
 * 'compact'` — Hermes on iOS ignores it (see show/[id].tsx) — so the suffix
 * stays ours and only the number goes through the locale.
 */
export function compactCount(n: number, locale: string): string {
  const one = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(intlTag(locale), one)}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString(intlTag(locale), one)}K`;
  return n.toLocaleString(intlTag(locale));
}
