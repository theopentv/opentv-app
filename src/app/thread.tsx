/**
 * The community thread for one episode, show or film.
 *
 * WHY THIS IS ITS OWN SCREEN rather than a section spliced into the episode
 * and show pages, which is how the plan phrases it (§7, "thread on the episode
 * and show screens"):
 *
 *  1. Both of those screens are one long `ScrollView`. A `FlatList` inside a
 *     `ScrollView` is the nested-virtualisation bug INSTRUCTIONS.md names as a
 *     P2 — the list stops recycling, mounts every row, and the screen locks up
 *     on exactly the shows with the most comments.
 *  2. The composer needs the keyboard, and the episode screen is a horizontal
 *     pager. A text field inside a swipeable page fights the gesture.
 *
 * So both screens get a row that opens this, which is the same two-tap reach
 * and keeps one virtualised list per screen. The thread itself lives in
 * `components/comment-thread.tsx` and is used by both.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import type { ThreadTarget } from '@/community-comments';
import { CommentThread } from '@/components/comment-thread';
import { isEpisodeWatched } from '@/components/side-thread';
import { NavHeader, Screen } from '@/components/ui';
import { boardTargetFor } from '@/pure';
import { episodeGated, revealEpisode } from '@/spoiler-gate';
import { t } from '@/i18n';
import { markWatchedWithPrompt } from '@/mark';

/** A route param that must be a non-negative integer, or nothing at all. */
function numberParam(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export default function ThreadScreen() {
  const { source, key, season, episode, title, name, tvdbMovie } = useLocalSearchParams<{
    /** A film's TVDB id, for the shared board only — see `board` below. */
    tvdbMovie?: string;
    source?: string;
    key?: string;
    season?: string;
    episode?: string;
    title?: string;
    /**
     * THE TARGET'S OWN NAME, which is not always the header's.
     *
     * `title` is what this screen puts at the top, and for an episode thread
     * that is "Severance · S1E2" -- a label, not the name of the thing the
     * key addresses. Sending it as the target's name would file the SHOW
     * under an episode label for everybody. So the bare name travels in its
     * own param, and is the only one trusted for that.
     */
    name?: string;
  }>();

  const target: ThreadTarget = {
    // Anything unrecognised falls back to `tvdb`, the only source a show or
    // episode is ever addressed by. An unknown source would earn a 400 and an
    // empty thread, which reads as "nobody has commented" — a lie.
    source: source === 'tmdb' || source === 'title' ? source : 'tvdb',
    key: key ?? '',
    season: numberParam(season),
    episode: numberParam(episode),
    /* `title` is safe to fall back on only where there is no episode, because
       that is exactly when the header label IS the target's name. */
    title: name || (season === undefined && episode === undefined ? title : undefined),
  };

  /*
   * THE SAME TITLE ON THE SHARED BOARD (CommsUni), which only knows TVDB ids:
   * an episode by its show plus season and episode, a show by its own id, a
   * film by the TVDB id the film screen passes. Anything else has no board.
   */
  const board = boardTargetFor(target, numberParam(tvdbMovie));

  /*
   * AN UNWATCHED EPISODE ASKS FIRST, here rather than on each door to this
   * screen: the episode page, a live room, a profile's comment list and
   * whatever links here next all arrive through this one route. A film is not
   * asked again — its own pill already did.
   */
  const [shown, setShown] = useState<string | null>(null);
  const gated = episodeGated(target, isEpisodeWatched, shown);

  /*
   * THE FILM'S QUESTION, WORD FOR WORD (22 Oct, Mahmood): the same alert and
   * the same three answers a film asks with — read anyway, "I've watched this
   * episode" (marks it, then opens), or Cancel, which leaves the screen.
   */
  useEffect(() => {
    if (!gated) return;
    const open = () => setShown(revealEpisode(target));
    Alert.alert(
      t('movie.spoilersTitle'),
      t('episode.spoilersBody'),
      [
        { text: t('movie.displayAnyway'), onPress: open },
        {
          text: t('episode.watchedThisEpisode'),
          // Cancel in the previous-episodes prompt undoes the mark: then it is
          // still unwatched, so leave rather than open.
          onPress: () =>
            markWatchedWithPrompt(Number(target.key), target.season as number, target.episode as number, () =>
              isEpisodeWatched(Number(target.key), target.season as number, target.episode as number) ? open() : router.back(),
            ),
        },
        { text: t('common.cancel'), style: 'cancel', onPress: () => router.back() },
      ],
      { cancelable: true, onDismiss: () => router.back() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per gated arrival
  }, [gated]);

  return (
    <Screen>
      <NavHeader title={title || t('community.comments.title')} close />
      <KeyboardAvoidingView
        style={styles.fill}
        // BOTH PLATFORMS (21 Oct): edge-to-edge Android no longer resizes the
        // window for the keyboard, so `undefined` left the toolbar under it.
        behavior="padding"
        // The header is already laid out above this, so the inset the keyboard
        // has to clear is only what sits below it.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        {gated ? (
          <View style={styles.fill} />
        ) : (
          <CommentThread target={target} board={board} />
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
