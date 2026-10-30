/**
 * The banner frame WHILE IT IS BEING ADJUSTED. The adjuster is a see-through
 * layer over the real profile, and this is how the profile under it follows the
 * finger: the adjuster writes here, the Profile tab draws whatever is here in
 * place of the saved frame. Null when nobody is adjusting.
 */
import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { getMeta, setMeta } from '@/db';
import type { CoverFrame } from '@/pure';
import { setThemeAccentHex } from '@/theme';

let live: CoverFrame | null = null;
const subs = new Set<() => void>();

export function setLiveCoverFrame(f: CoverFrame | null): void {
  live = f;
  subs.forEach((s) => s());
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** The whole frame — for the banner image ONLY, which redraws on every move. */
export function useLiveCoverFrame(): CoverFrame | null {
  return useSyncExternalStore(subscribe, () => live);
}

/**
 * Only the live frame's size and background — for the PROFILE, which needs them
 * for the banner's height and the page behind it. A string, so a drag (x/y/zoom
 * only) does not re-render the whole profile on every move; resizing does,
 * because the page itself has to move.
 */
export function useLiveCoverShape(): string | null {
  return useSyncExternalStore(subscribe, () => (live == null ? null : `${live.size},${live.bg ? 1 : 0},${live.fade ? 1 : 0},${live.strength.toFixed(2)},${live.tint ?? ''}`));
}

/**
 * Open the adjuster OVER THE PROFILE: Edit profile and the picker are closed
 * first, or the see-through layer would show them instead of the banner. The
 * push waits for the dismissal to land; issued at once, it is lost.
 */
export function openCoverAdjust(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { router } = require('expo-router') as typeof import('expo-router');
  // Nothing to dismiss when this was opened from a tab or a link.
  if (router.canDismiss()) router.dismissAll();
  setTimeout(() => router.push('/cover-adjust'), 400);
}

/** The picture's width/height ratio, as the banner last drew it — the
 *  adjuster's drag maths needs it to move the picture with the finger. */
let liveRatio = 16 / 9;
export function setLiveCoverRatio(r: number): void {
  liveRatio = r;
}
export function liveCoverRatio(): number {
  return liveRatio;
}

/**
 * The theme changed while the profile was underneath something (the adjuster,
 * Theme colours). The tab only re-reads its theme on focus, which it never got,
 * so the new colours waited until the layer closed; this tells it at once.
 */
const themeSubs = new Set<() => void>();
export function profileThemeChanged(): void {
  themeSubs.forEach((s) => s());
}
/** Called when the theme changes; returns the unsubscribe, for an effect. */
export function onProfileThemeChanged(cb: () => void): () => void {
  themeSubs.add(cb);
  return () => {
    themeSubs.delete(cb);
  };
}

/*
 * CANCEL PUTS THE OLD BANNER BACK. A picked picture is written straight away, so
 * the adjuster can show it on the real page; until Done the previous banner, its
 * frame and its colours are held here, and only Done lets the old file go.
 */
const UNDO_KEY = 'coverUndo';
const UNDO_FIELDS = ['coverFile', 'coverUrl', 'coverFrame', 'profileThemeColor', 'profileThemeSecondary', 'profileThemeName'];

function removeFile(name: string | null | undefined): void {
  if (!name) return;
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch {}
}

/** Before a new banner replaces this one. A second pick keeps the first hold. */
export function holdCover(): void {
  if (getMeta(UNDO_KEY)) return;
  setMeta(UNDO_KEY, JSON.stringify(Object.fromEntries(UNDO_FIELDS.map((k) => [k, getMeta(k) ?? '']))));
}

/** Done: the new banner stands, and the one held can go. */
export function commitCover(): void {
  const held = getMeta(UNDO_KEY);
  if (!held) return;
  const file = (JSON.parse(held) as Record<string, string>).coverFile;
  if (file !== getMeta('coverFile') && file !== getMeta('coverStillFile')) removeFile(file);
  setMeta(UNDO_KEY, '');
}

/** Cancel: everything as it was. The caller republishes. */
export function undoCover(): boolean {
  const raw = getMeta(UNDO_KEY);
  if (!raw) return false;
  const held = JSON.parse(raw) as Record<string, string>;
  const picked = getMeta('coverFile');
  if (picked !== held.coverFile) removeFile(picked);
  for (const k of UNDO_FIELDS) setMeta(k, held[k] ?? '');
  setThemeAccentHex(held.profileThemeColor || null);
  setMeta(UNDO_KEY, '');
  return true;
}
