/**
 * Another device's op, done to this one — shared by BOTH transports (2.0.0).
 *
 * The server relay (`device-sync.ts`) and the user's own cloud folder
 * (`cloud-sync.ts`) carry the same ops in the same vocabulary, so they must
 * apply them the same way: one function, not two copies that drift. Each
 * transport keeps its own cursor and says how to advance it through `onEach`;
 * everything else — the order, the echo guard, a newer build's unknown kinds,
 * one bad op not stopping the rest, the screens being told once — lives here.
 */
import {
  addMovieRewatch,
  addShow,
  addMovieToWatchlist,
  clearEpisodeRating,
  clearMovieStars,
  deleteMovie,
  deleteShow,
  DESIGN_AT_KEY,
  episodeEmotions,
  getMeta,
  getShowsMissingName,
  getShowsMissingPoster,
  markRewatched,
  markWatched,
  notifyRemoteChange,
  setApplyingRemote,
  setCharacterVoteExact,
  setEpisodeRating,
  setFollowing,
  setMeta,
  setMovieStars,
  setMovieWatched,
  setShowArchived,
  setShowFavorited,
  setShowFinished,
  setShowName,
  setShowPoster,
  toggleEpisodeEmotion,
  unmarkWatched,
} from '@/db';
import { orderOps, parseOp, type Action, type RemoteOp } from '@/sync-ops';

/**
 * Apply a batch in the order the person acted, under the echo guard.
 *
 * `onEach` runs after every op, applied or skipped, so a transport can move
 * its cursor PER OP: a crash halfway through must not replay what already
 * landed, because "+1 rewatch" replayed is a wrong number nobody can spot.
 * `skip` lets a caller decline an op it knows is already in the library (the
 * cloud seed's rewatches) while still moving past it.
 *
 * The screens are told AFTER the batch and AFTER the guard drops: a hundred
 * ops arriving together are one thing happening, and a listener that writes
 * while re-reading must not be mistaken for a remote apply and swallowed. An
 * empty batch tells nobody — every device polls on a timer, and waking every
 * open screen for nothing costs more than the bug this fixed.
 */
export function applyRemoteOps<T extends RemoteOp>(
  ops: readonly T[],
  onEach: (op: T) => void,
  skip?: (a: Action, op: T) => boolean,
): void {
  const ticked = new Set<number>();
  setApplyingRemote(true);
  try {
    for (const op of orderOps(ops)) {
      const a = parseOp(op.kind, op.payload);
      if (a?.t === 'watch') ticked.add(a.show);
      // `null` is a newer build's vocabulary. Skip it and keep the cursor
      // moving — refusing the batch would wedge this device for good.
      if (a && !skip?.(a, op)) {
        try {
          apply(a, op.ts);
        } catch {
          // One op that cannot be applied — a show this device never had —
          // must not stop the rest of the batch.
        }
      }
      onEach(op);
    }
  } finally {
    setApplyingRemote(false);
  }
  if (ops.length > 0) notifyRemoteChange();
  if (ticked.size > 0) {
    const nameless = getShowsMissingName().map((r) => r.tvdbId).filter((id) => ticked.has(id));
    if (nameless.length) void nameShows(nameless);
  }
}

/**
 * A SHOW THIS DEVICE FIRST MET AS A TICK. With no `showAdd` before it — a show
 * added before sync was on, or by a build without that op — `markWatched`
 * makes the row from the id alone, and it read "81189" with no poster until
 * the next launch's backfill. Named now, from TheTVDB, the way the backfill
 * would. Offline: the launch backfill still gets it.
 */
async function nameShows(ids: number[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tvdbSeries } = require('@/tvdb') as typeof import('@/tvdb');
  const posterless = new Set(getShowsMissingPoster().map((r) => r.tvdbId));
  for (const id of ids) {
    const hit = await tvdbSeries(id);
    const name = hit?.name?.trim();
    if (name && name !== String(id)) setShowName(id, name);
    if (posterless.has(id) && hit?.image && !hit.image.includes('/images/missing/')) setShowPoster(id, hit.image);
  }
  notifyRemoteChange();
}

/** Everything one op means, done through the same functions the screens use. */
function apply(a: Action, ts = 0): void {
  switch (a.t) {
    case 'watch':
      markWatched(a.show, a.s, a.e, a.at || undefined);
      break;
    case 'unwatch':
      unmarkWatched(a.show, a.s, a.e);
      break;
    case 'rewatch':
      markRewatched(a.show, a.s, a.e);
      break;
    case 'rate':
      setEpisodeRating(a.show, a.s, a.e, a.ten);
      break;
    case 'unrate':
      clearEpisodeRating(a.show, a.s, a.e);
      break;
    case 'showFlag':
      if (a.flag === 'followed') setFollowing(a.show, a.on);
      else if (a.flag === 'favorited') setShowFavorited(a.show, a.on);
      else if (a.flag === 'archived') setShowArchived(a.show, a.on);
      else setShowFinished(a.show, a.on);
      break;
    case 'showDelete':
      deleteShow(a.show);
      break;
    case 'showAdd':
      addShow(a.show, a.name, a.poster);
      break;
    case 'movieWatch':
      setMovieWatched(a.name, a.on);
      break;
    case 'movieStars':
      if (a.ten == null) clearMovieStars(a.name);
      else setMovieStars(a.name, a.ten);
      break;
    case 'emotion': {
      // The op says what should be TRUE; the local call is a toggle. Only act
      // when they disagree, or replaying would undo what it just said.
      const on = episodeEmotions(a.show, a.s, a.e).includes(a.emotion);
      if (on !== a.on) toggleEpisodeEmotion(a.show, a.s, a.e, a.emotion);
      break;
    }
    case 'charVote':
      setCharacterVoteExact(a.show, a.s, a.e, a.name);
      break;
    case 'movieRewatch':
      addMovieRewatch(a.name);
      break;
    case 'movieDelete':
      deleteMovie(a.name);
      break;
    case 'movieAdd':
      addMovieToWatchlist(a.name, a.poster, a.year, a.tmdbId);
      break;
    case 'design':
      applyDesign(a.keys, ts);
      break;
  }
}

/**
 * A DESIGN FROM ANOTHER DEVICE, unless this one changed its own since.
 *
 * Applied in ts order, so of several snapshots the newest ends up standing.
 * The banner is the one part that is not a value: it is a file, so a new
 * address means downloading the picture, which happens after the batch and
 * under the same echo guard, then tells the screens.
 */
function applyDesign(keys: Record<string, string>, ts: number): void {
  if (ts < (Number(getMeta(DESIGN_AT_KEY)) || 0)) return;
  for (const [k, v] of Object.entries(keys)) {
    if (k === 'coverUrl') continue;
    setMeta(k, v);
  }
  setMeta(DESIGN_AT_KEY, String(ts));
  const url = keys.coverUrl;
  if (url && url !== getMeta('coverUrl')) void takeBanner(url);
}

async function takeBanner(url: string): Promise<void> {
  try {
    // Required lazily: the templates module draws, and this one must not load React screens.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bannerToDocuments } = require('@/profile-templates') as typeof import('@/profile-templates');
    const name = await bannerToDocuments(url);
    const old = getMeta('coverFile');
    setApplyingRemote(true);
    try {
      setMeta('coverFile', name);
      setMeta('coverUrl', url);
      setMeta('coverStillFile', '');
    } finally {
      setApplyingRemote(false);
    }
    if (old && old !== name) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
        const f = new File(Paths.document, old);
        if (f.exists) f.delete();
      } catch {
        // An orphaned picture costs a little space, never the new banner.
      }
    }
    notifyRemoteChange();
  } catch {
    // Offline or a dead address: keep the banner this device had.
  }
}
