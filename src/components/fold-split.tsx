/**
 * TWO PANES ON AN OPEN iPHONE DUO, the planner reel's pattern (design/referance/
 * duo-two-pane/NOTES.md, decided 29 Oct). The screen keeps the left half and
 * its place; the show, film or episode tapped there opens in the right half,
 * which is empty until then: the theme's own background, not the cover (Mahmood, 1 Nov). Everywhere else this is a plain pass-through.
 *
 * THE PAGE MOUNTS HERE, NOT AS A ROUTE. A route on top owns the window's touches
 * and leaves the list dead beside it (design/iphone-duo/PLAN.md, Phase 4). The
 * pages take their id from `DetailPaneContext` instead, and a screen wraps its
 * default export in this so `useScreenWidth` already reads its half.
 */
import { useCallback, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import EpisodeScreen from '@/app/episode/[id]';
import MovieScreen from '@/app/movie/[name]';
import ShowScreen from '@/app/show/[id]';
import { DetailPaneContext, FoldContext, ScreenWidthContext, useFoldHalf } from '@/components/ui';
import { colors } from '@/theme';

/** The band either side of the fold: nothing of the page sits in it. */
const PANE_GAP = 28;

/* eslint-disable @typescript-eslint/no-require-imports */
// Required on first use: these screens import ui.tsx, which this file is part of.
const PAGES: Record<string, () => ComponentType> = {
  show: () => ShowScreen,
  movie: () => MovieScreen,
  episode: () => EpisodeScreen,
  puzzle: () => require('@/app/puzzle').default,
  'puzzle-intro': () => require('@/app/puzzle-intro').default,
  'puzzle-archive': () => require('@/app/puzzle-archive').default,
  stats: () => require('@/app/stats').default,
  'deep-stats': () => require('@/app/deep-stats').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** `/show/12`, `/puzzle?day=2026-10-30` → the page, its id and its query. */
function pageOf(path: string): { Page: ComponentType; id: string; params: Record<string, string> } | null {
  const [route, query = ''] = path.split('?');
  const [, kind, raw = ''] = /^\/([a-z-]+)(?:\/(.+))?$/.exec(route) ?? [];
  const get = kind ? PAGES[kind] : undefined;
  if (!get) return null;
  const params: Record<string, string> = {};
  // By hand: React Native's URLSearchParams cannot iterate.
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return { Page: get(), id: decodeURIComponent(raw), params };
}

export function FoldSplit({ children }: { children: ReactNode }) {
  const half = useFoldHalf();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { left, right } = insets;
  // Every page opened stays mounted under the one on top, so back returns to
  // the same tab and scroll instead of rebuilding the page (Mahmood, 1 Nov).
  const [stack, setStack] = useState<{ path: string; key: number }[]>([]);
  const nextKey = useRef(0);
  const fold = useMemo(
    () => ({
      half,
      open: (path: string, inPane: boolean, replace?: boolean) =>
        setStack((s) => {
          const entry = { path, key: nextKey.current++ };
          return replace ? [...s.slice(0, -1), entry] : inPane ? [...s, entry] : [entry];
        }),
    }),
    [half],
  );
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);
  // The row sits inside the safe area on both sides.
  const paneW = half == null ? 0 : width - left - right - half - PANE_GAP;
  return (
    <FoldContext.Provider value={fold}>
      <View style={half != null ? s.row : s.fill}>
        {/* The side bar's inset belongs to neither half: given to the left one,
            its cover (pinned edge to edge) ran 84 pt into the right half and
            sat on top of it (Mahmood, 1 Nov). Left keeps only its own edge. */}
        <View style={half != null ? { width: half + left } : s.fill}>
          {half != null ? (
            <SafeAreaInsetsContext.Provider value={{ ...insets, right: 0 }}>
              <ScreenWidthContext.Provider value={half}>{children}</ScreenWidthContext.Provider>
            </SafeAreaInsetsContext.Provider>
          ) : (
            children
          )}
        </View>
        {half != null && (
          <View style={[s.pane, { width: paneW, marginStart: PANE_GAP }]}>
            <SafeAreaInsetsContext.Provider value={{ ...insets, left: 0, right: 0 }}>
              <ScreenWidthContext.Provider value={paneW}>
                {stack.map((e, i) => (
                  <PaneEntry
                    key={e.key}
                    path={e.path}
                    width={paneW}
                    canBack={i > 0}
                    // The page just under the top stays drawn: the new one slides up
                    // over it, not over black (Mahmood, 1 Nov). Lower ones hide.
                    shown={i >= stack.length - 2}
                    back={back}
                    close={close}
                  />
                ))}
              </ScreenWidthContext.Provider>
            </SafeAreaInsetsContext.Provider>
          </View>
        )}
      </View>
    </FoldContext.Provider>
  );
}

/** One page of the right half. Slides up like a page on the phone, and down
 *  when it leaves; pages further down are kept, hidden, with their state. */
function PaneEntry(p: { path: string; width: number; canBack: boolean; shown: boolean; back: () => void; close: () => void }) {
  const page = useMemo(() => pageOf(p.path), [p.path]);
  const pane = useMemo(
    () => (page ? { id: page.id, params: page.params, width: p.width, canBack: p.canBack, back: p.back, close: p.close } : null),
    [page, p.width, p.canBack, p.back, p.close],
  );
  if (!page || !pane) return null;
  return (
    <Animated.View
      entering={SlideInDown.duration(320)}
      exiting={SlideOutDown.duration(260)}
      style={[StyleSheet.absoluteFill, s.page, !p.shown && s.hidden]}>
      <DetailPaneContext.Provider value={pane}>
        <page.Page />
      </DetailPaneContext.Provider>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  pane: { overflow: 'hidden' },
  page: { backgroundColor: colors.bg },
  hidden: { display: 'none' },
});
