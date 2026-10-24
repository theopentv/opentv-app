import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EpisodePagerScreen from '@/app/episode/[id]';
import MovieScreen from '@/app/movie/[name]';
import ShowScreen from '@/app/show/[id]';
import { COMMENTS_SPLIT_MIN_W } from '@/pure';
import { ColumnContext, PaneContext, type Pane } from '@/split-context';
import { colors } from '@/theme';

/** The list takes a quarter of the screen, but never less than a phone row
 *  needs: 25% of the open Duo on its side is 217pt, where a show's name and
 *  episode code no longer fit beside its picture. 300 is the floor. */
const listWidth = (w: number) => Math.max(300, Math.round(w * 0.25));

/** The tab's host, while that tab is the one on screen. A plain module slot,
 *  not context: a list row anywhere in the tab can open a page without each of
 *  the ~20 call sites threading a hook through its own component. */
let activeHost: ((href: string) => boolean) | null = null;

/**
 * Open a show, film or episode from a list. On a wide screen it lands beside
 * the list, in the tab that is showing; everywhere else it is a normal push.
 * Pages opened from INSIDE a page use useDetailNav().open instead, which
 * stacks in the pane rather than replacing it.
 */
export function openDetail(href: string): void {
  if (activeHost?.(href)) return;
  router.push(href as never);
}

/** `/show/123?tmdbId=9` -> the page and its params, as its route would get them. */
function parseHref(href: string): { kind: 'show' | 'movie' | 'episode'; params: Record<string, string> } | null {
  const [path, query = ''] = href.split('?');
  const m = /^\/(show|movie|episode)\/(.+)$/.exec(path);
  if (!m) return null;
  const params: Record<string, string> = {};
  // Hand-parsed: React Native's URLSearchParams leaves most methods unimplemented.
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  const kind = m[1] as 'show' | 'movie' | 'episode';
  params[kind === 'movie' ? 'name' : 'id'] = decodeURIComponent(m[2]);
  return { kind, params };
}

/**
 * Wraps a tab's screen. Nothing open: the tab as it always was, full width.
 * Something opened on a wide screen: the tab in a list column on the left and
 * the page beside it, both live. Folding the Duo closed with a page open
 * re-opens that page as a normal screen, so the user keeps their place.
 */
export function SplitHost({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenW = width - insets.left - insets.right;
  const wide = screenW >= COMMENTS_SPLIT_MIN_W;
  const [stack, setStack] = useState<string[]>([]);
  const top = stack.length > 0 ? stack[stack.length - 1] : null;

  // This tab handles list taps only while it is the one on screen.
  useFocusEffect(
    useCallback(() => {
      const host = (href: string) => {
        if (!wide || !parseHref(href)) return false;
        setStack([href]);
        return true;
      };
      activeHost = host;
      return () => {
        if (activeHost === host) activeHost = null;
      };
    }, [wide]),
  );

  // Folded closed (or the window narrowed) with a page open: hand it over to
  // the router as a normal screen instead of dropping it.
  useEffect(() => {
    if (wide || top == null) return;
    setStack([]);
    router.push(top as never);
  }, [wide, top]);

  const parsed = top != null && wide ? parseHref(top) : null;
  if (parsed == null) return <>{children}</>;

  const listW = listWidth(screenW);
  const paneW = screenW - listW;
  const pane: Pane = {
    params: parsed.params,
    width: paneW,
    close: () => setStack((s) => s.slice(0, -1)),
    open: (href) => setStack((s) => [...s, href]),
    replace: (href) => setStack((s) => [...s.slice(0, -1), href]),
  };
  const Page = parsed.kind === 'show' ? ShowScreen : parsed.kind === 'movie' ? MovieScreen : EpisodePagerScreen;

  return (
    <View style={styles.row}>
      <View style={{ width: listW + insets.left }}>
        <ColumnContext value={{ width: listW, padLeft: true, padRight: false }}>{children}</ColumnContext>
      </View>
      <View style={[styles.pane, { width: paneW + insets.right, paddingRight: insets.right }]}>
        <ColumnContext value={{ width: paneW, padLeft: false, padRight: true }}>
          <PaneContext value={pane}>
            {/* keyed: another title is another page, from its own first state */}
            <Page key={top} />
          </PaneContext>
        </ColumnContext>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  pane: { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: colors.line, backgroundColor: colors.bg },
});
