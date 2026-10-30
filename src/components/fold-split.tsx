/**
 * TWO PANES ON AN OPEN iPHONE DUO, the planner reel's pattern (design/referance/
 * duo-two-pane/NOTES.md, decided 29 Oct). The screen keeps the left half and
 * its place; the show, film or episode tapped there opens in the right half,
 * which is empty until then. Everywhere else this is a plain pass-through.
 *
 * THE PAGE MOUNTS HERE, NOT AS A ROUTE. A route on top owns the window's touches
 * and leaves the list dead beside it (design/iphone-duo/PLAN.md, Phase 4). The
 * pages take their id from `DetailPaneContext` instead, and a screen wraps its
 * default export in this so `useScreenWidth` already reads its half.
 */
import { Image } from 'expo-image';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EpisodeScreen from '@/app/episode/[id]';
import MovieScreen from '@/app/movie/[name]';
import ShowScreen from '@/app/show/[id]';
import { DetailPaneContext, FoldContext, ScreenWidthContext, useFoldHalf } from '@/components/ui';
import { colors } from '@/theme';

/** The band either side of the fold: nothing of the page sits in it. */
const PANE_GAP = 28;

const PAGES: Record<string, ComponentType> = { show: ShowScreen, movie: MovieScreen, episode: EpisodeScreen };

function pageOf(path: string): { Page: ComponentType; id: string } | null {
  const [, kind, raw] = /^\/(show|movie|episode)\/([^?]+)/.exec(path) ?? [];
  return kind && raw ? { Page: PAGES[kind], id: decodeURIComponent(raw) } : null;
}

export function FoldSplit({ children }: { children: ReactNode }) {
  const half = useFoldHalf();
  const { width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const [stack, setStack] = useState<string[]>([]);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const fold = useMemo(
    () => ({
      half,
      setBackdrop,
      open: (path: string, inPane: boolean) => setStack((s) => (inPane ? [...s, path] : [path])),
    }),
    [half],
  );
  // The row sits inside the safe area on both sides.
  const paneW = half == null ? 0 : width - left - right - half - PANE_GAP;
  const top = stack[stack.length - 1];
  const page = top != null ? pageOf(top) : null;
  const pane = useMemo(
    () =>
      page
        ? {
            id: page.id,
            width: paneW,
            canBack: stack.length > 1,
            back: () => setStack((s) => s.slice(0, -1)),
            close: () => setStack([]),
          }
        : null,
    [page?.id, paneW, stack.length], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <FoldContext.Provider value={fold}>
      <View style={half != null ? s.row : s.fill}>
        {/* Behind both halves, so the cover runs across the fold with no gap. */}
        {half != null && backdrop != null && page == null && (
          <Image source={{ uri: backdrop }} style={s.backdrop} contentFit="cover" />
        )}
        {/* Wider than `half` by the safe areas: the scene pads both sides inside
            this box, so `half` is what is left, ending before the fold. */}
        <View style={half != null ? { width: half + left + right } : s.fill}>
          <ScreenWidthContext.Provider value={half}>{children}</ScreenWidthContext.Provider>
        </View>
        {half != null && (
          <View style={[s.pane, { width: paneW, marginStart: PANE_GAP - right }]}>
            {page && pane ? (
              <DetailPaneContext.Provider value={pane}>
                <ScreenWidthContext.Provider value={paneW}>
                  <page.Page key={top} />
                </ScreenWidthContext.Provider>
              </DetailPaneContext.Provider>
            ) : null}
          </View>
        )}
      </View>
    </FoldContext.Provider>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  pane: { overflow: 'hidden' },
  // The empty half reads as space waiting, not a failed load (decided 29 Oct).
  backdrop: { ...StyleSheet.absoluteFill, opacity: 0.35 },
});
