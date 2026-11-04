/**
 * UN-MARKING AN EPISODE, everywhere it can happen (4 Nov).
 *
 * Un-ticking now takes the episode's rating, feelings and favourite character
 * with it (see `unmarkWatchedMany`), so it is no longer a harmless tap: every
 * screen that un-marks asks first, through `confirmUnmark`, and offers Undo for
 * a few seconds after. One function, so no screen can forget either half — or
 * the community vote, which lives on the server and is withdrawn here.
 */
import { Alert } from 'react-native';

import { postCharacterVote, postRating, clearCharacterVote } from '@/community-ratings';
import {
  notifyRemoteChange,
  restoreUnmarked,
  snapshotEpisodes,
  snapshotHasReactions,
  unmarkWatchedMany,
  type UnmarkSnapshot,
} from '@/db';
import { showUndo } from '@/components/undo-toast';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { emotionNames } from '@/pure';

type Episodes = readonly { season: number; episode: number }[];

/**
 * Take this person's vote off the community averages for every episode that
 * had one. `score: null, emotions: []` is exactly what clearing the stars and
 * every face by hand sends; a nameless TV Time favourite was never on the
 * server, so there is nothing to withdraw for it.
 */
export function withdrawCommunity(snap: UnmarkSnapshot): void {
  const key = String(snap.showId);
  for (const ep of snap.episodes) {
    if (ep.stars != null || ep.emotions.length > 0) {
      postRating({ source: 'tvdb', key, season: ep.season, episode: ep.episode, score: null, emotions: [] });
    }
    if (ep.character?.name) clearCharacterVote('tvdb', key, { season: ep.season, episode: ep.episode });
  }
}

/** The mirror: put the vote back the way a re-rate and a re-pick would. */
function restoreCommunity(snap: UnmarkSnapshot): void {
  const key = String(snap.showId);
  for (const ep of snap.episodes) {
    if (ep.stars != null || ep.emotions.length > 0) {
      postRating({
        source: 'tvdb',
        key,
        season: ep.season,
        episode: ep.episode,
        score: ep.stars,
        emotions: emotionNames(ep.emotions),
      });
    }
    if (ep.character?.name) {
      postCharacterVote({ source: 'tvdb', key, character: ep.character.name, season: ep.season, episode: ep.episode });
    }
  }
}

/** Un-mark, reactions and community vote included. Returns what Undo needs. */
export function unmarkEpisodes(showId: number, episodes: Episodes): UnmarkSnapshot {
  const snap = unmarkWatchedMany(showId, episodes);
  withdrawCommunity(snap);
  return snap;
}

/** Put back everything `unmarkEpisodes` took, and tell the open screens. */
export function undoUnmark(snap: UnmarkSnapshot): void {
  restoreUnmarked(snap);
  restoreCommunity(snap);
  // Undo happens on a screen that is already focused, so a focus re-read never
  // comes; this is the signal every library screen already listens to.
  notifyRemoteChange();
}

/**
 * ASK, UN-MARK, OFFER UNDO.
 *
 * The question names the reactions only when there are some: telling somebody
 * their rating will go when they never rated is a warning about nothing, and a
 * warning about nothing teaches people to stop reading the real ones.
 *
 * `ask` lets the batch screens keep their own titles ("Unmark Season 2?");
 * the single episode uses the default sentence. `after` runs on a yes only —
 * an Undo refreshes the screens through `undoUnmark`, and a sheet's
 * `router.back()` run twice would close the page under it.
 */
export function confirmUnmark(
  showId: number,
  episodes: Episodes,
  after?: () => void,
  ask?: { title: string; body: string; button: string },
): void {
  if (episodes.length === 0) return;
  const lose = snapshotHasReactions(snapshotEpisodes(showId, episodes));
  const one = episodes.length === 1;
  const title = ask?.title ?? t('unmark.title');
  const extra = lose ? t(one ? 'unmark.losesOne' : 'unmark.losesMany') : null;
  const body = ask ? [ask.body, extra].filter(Boolean).join('\n\n') : (extra ?? t('unmark.plain'));

  Alert.alert(title, body, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: ask?.button ?? t('unmark.button'),
      style: 'destructive',
      onPress: () => {
        tapLight();
        const snap = unmarkEpisodes(showId, episodes);
        after?.();
        const first = episodes[0];
        showUndo(
          one
            ? t('unmark.toastOne', { season: first.season, episode: first.episode })
            : t('unmark.toastMany', { count: episodes.length }),
          () => undoUnmark(snap),
        );
      },
    },
  ]);
}
