import { Dimensions } from 'react-native';

import { archiveImageSource, type SharedComment } from '@/commsuni';

/** The card's inner width (card margin 16 each side, padding 15 each side), 4:3 —
 *  the shape TV Time's own comment pictures mostly were. */
// `screenWidth`: pass useScreenWidth() from the calling component (window minus
// side safe-area insets, e.g. the closed iPhone Duo strip). Omitted, it falls
// back to the raw window width.
const box = (screenWidth = Dimensions.get('window').width) => {
  const w = Math.min(screenWidth, 700) - 62;
  return { width: w, height: Math.round(w * 0.75) };
};

/** A shared comment's picture: its own link, or the archive's through our server. */
export function sharedPicture(c: SharedComment, screenWidth?: number): { source: { uri: string; headers?: Record<string, string> }; width: number; height: number } | null {
  if (c.image) return { source: { uri: c.image }, ...box(screenWidth) };
  const archived = c.archiveImage ? archiveImageSource(c.id) : null;
  return archived ? { source: archived, ...box(screenWidth) } : null;
}
