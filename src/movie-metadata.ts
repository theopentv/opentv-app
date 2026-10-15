/** Bundled movie metadata fetched from TMDB (scripts/fetch-movie-metadata.py). */
import type { WatchKind } from '@/pure';

export type MovieCast = { name: string | null; character: string | null; photo: string | null };
/** `kind` only on a live fetch: the bundle never recorded one. */
export type MovieProvider = { name: string | null; logo: string | null; kind?: WatchKind };
export type MovieMeta = {
  runtime: number | null;
  genres: string[];
  release: string | null;
  overview: string | null;
  rating: number;
  votes: number;
  backdrop: string | null;
  cast: MovieCast[];
  providers: MovieProvider[];
};

// require + cast keeps tsc from inferring a giant literal type for the JSON
// eslint-disable-next-line @typescript-eslint/no-require-imports
const metadata = require('@/data/movie-metadata.json') as Record<string, MovieMeta>;

export function movieMeta(tmdbId: number | null | undefined): MovieMeta | undefined {
  return tmdbId != null ? metadata[String(tmdbId)] : undefined;
}
