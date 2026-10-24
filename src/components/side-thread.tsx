/**
 * THE COMMENTS BESIDE THE PAGE, on a screen wide enough for both: the iPhone
 * Duo opened (669pt, a regular-width size class), an iPad held upright.
 *
 * On a phone a show, episode or film page has a Comments row that pushes the
 * thread over the page. Opened, the Duo has room for the two at once, so the
 * thread sits beside the page, the way Mail puts the message beside its list.
 * Same `CommentThread` as the thread screen, so nothing about it can drift.
 *
 * Only for somebody who has joined: anybody else's Comments row opens this
 * phone's own archive, and a standing "join the community" panel beside every
 * page would be a pitch, not their comments. Folding the phone shut puts the
 * page back to full width and its Comments row back where it was.
 */
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { ThreadTarget } from '@/community-comments';
import { useJoined } from '@/community-session';
import { CommentThread } from '@/components/comment-thread';
import { Text } from '@/components/text';
import { PillButton, useDetailWidth, useTopInset, useWideDetail } from '@/components/ui';
import { getWatch } from '@/db';
import { t } from '@/i18n';
import { boardTargetFor, commentsSplitLayout } from '@/pure';
import { episodeGated, revealEpisode } from '@/spoiler-gate';
import { colors, space } from '@/theme';

/** The split, or null when the page has the screen to itself. */
export function useCommentsSplit(): { pageW: number; threadW: number } | null {
  const joined = useJoined();
  const layout = commentsSplitLayout(useWindowDimensions().width);
  // OFF WHERE THE PAGE SITS BESIDE THE LIST (2.0.1). From 600pt up the page
  // is already one pane of two, and 669pt cannot hold list + page + comments.
  // There the comments are the next level down, opened from the page, which is
  // what Apple's list|detail keeps: the same hierarchy, one more level visible.
  const wide = useWideDetail();
  return joined && layout.split && !wide ? layout : null;
}

/** `useDetailWidth`, narrowed to the page's half while the comments are beside it.
 *  The episode pager sizes its pages from this, so it must be the page's width. */
export function usePageWidth(): number {
  const split = useCommentsSplit();
  const w = useDetailWidth();
  return split ? split.pageW : w;
}

/** The page's own column. ALWAYS rendered, phone included, where `flex: 1` in
 *  the root's column is exactly the box the page had before: one element in the
 *  same place whether split or not, so opening the phone does not remount the
 *  page (and lose the episode you swiped to). */
export function SplitPage({ split, children }: { split: { pageW: number } | null; children: ReactNode }) {
  return <View style={split ? { width: split.pageW } : styles.fill}>{children}</View>;
}

/** Put on the screen's root while split, so page and thread sit side by side.
 *  `row` follows the layout direction: in Arabic the comments are on the left. */
export const splitRow = { flexDirection: 'row' } as const;

/** This phone's own answer to "have you seen it?" — see `episodeGated`. */
export const isEpisodeWatched = (show: number, season: number, episode: number) =>
  getWatch(show, season, episode) != null;

/** "Spoilers ahead!" in place of the comments, for an unwatched film or episode.
 *  The film's pill asks the same in an alert; this is the in-place form. */
export function SpoilerGate({ film = false, onShow }: { film?: boolean; onShow: () => void }) {
  return (
    <View style={styles.gate}>
      <Text style={styles.gateTitle}>{t('movie.spoilersTitle')}</Text>
      <Text style={styles.gateBody}>{t(film ? 'movie.spoilersBody' : 'episode.spoilersBody')}</Text>
      <PillButton label={t('movie.displayAnyway')} small variant="outline" onPress={onShow} />
    </View>
  );
}

export function SideThread({
  split,
  target,
  tvdbMovie = null,
  padTop = true,
  spoilerGate = false,
}: {
  split: { threadW: number } | null;
  target: ThreadTarget;
  tvdbMovie?: number | null;
  /** False where the screen's root already sits below the status bar. */
  padTop?: boolean;
  /** An unwatched film: the same "spoilers" question its Comments pill asks.
   *  An episode needs nothing passed: it is gated on its own watch state. */
  spoilerGate?: boolean;
}) {
  const top = useTopInset();
  // The key revealed here: "film" for a film, the episode's key otherwise, so
  // swiping to the next unwatched episode asks again.
  const [shown, setShown] = useState<string | null>(null);
  const gated = spoilerGate ? shown == null : episodeGated(target, isEpisodeWatched, shown);
  if (!split) return null;
  return (
    <View style={[styles.pane, padTop && { paddingTop: top }]}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {t('community.comments.title')}
        </Text>
      </View>
      {gated ? (
        <SpoilerGate film={spoilerGate} onShow={() => setShown(spoilerGate ? 'film' : revealEpisode(target))} />
      ) : (
        <KeyboardAvoidingView style={styles.fill} behavior="padding">
          {/* Keyed by the target: swiping to the next episode is a new thread,
              not the last one's half-written comment and open replies. */}
          <CommentThread
            key={`${target.source}:${target.key}:${target.season ?? ''}:${target.episode ?? ''}`}
            target={target}
            board={boardTargetFor(target, tvdbMovie)}
          />
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pane: {
    flex: 1,
    backgroundColor: colors.bg,
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: colors.line,
  },
  // NavHeader's height and hairline, without its back chevron: closing this
  // half alone is not a thing, the page's own chevron closes both.
  head: {
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  gate: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: space.lg },
  gateTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  gateBody: { color: colors.dim, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
