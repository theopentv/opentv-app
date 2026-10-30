import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { a11yAction, a11yHidden } from '@/a11y';
import { ActionSheet } from '@/components/action-sheet';
import { Poster, posterSpeech } from '@/components/poster';
import { CheckCircle, EmptyState, Screen, TopTabs, useFoldHalf, useScreenWidth } from '@/components/ui';
import { archiveCounts, getHistory, getMeta, getMovieTotals, getShowProgress, getTotals, libraryOwner, setMeta, type ShowProgress } from '@/db';
import { markWatchedWithPrompt } from '@/mark';
import { usePlus } from '@/plus';
import { episodeMeta, showMeta } from '@/metadata';
import { hasOriginalZip } from '@/migrations';
import { gridGeometry, importLostHistory, seasonAirState, sortWatchList, validWatchListSort, WATCH_LIST_SORTS, type WatchListSort } from '@/pure';
import { fetchShowMeta, showMetaIsStale } from '@/show-meta-fetch';
import { pool } from '@/tmdb';
import { ShowPane } from '@/components/show-pane';
import { useMetaFillRunning } from '@/meta-fill';
import { upcomingEpisodes } from '@/widget-data';
import { airedTotalOf, progressColorOf, progressOf } from '@/show-status';
import { colors, radius, space, ls } from '@/theme';
import { currentLocale, t } from '@/i18n';
import { intlTag } from '@/locale-resolve';

const TABS = ['Watch List', 'Upcoming'] as const;

const SORT_ICON: Record<WatchListSort, 'time-outline' | 'calendar-outline' | 'calendar-clear-outline' | 'layers-outline' | 'shuffle-outline'> = {
  recent: 'time-outline',
  releaseDate: 'calendar-outline',
  releaseDateNewest: 'calendar-clear-outline',
  mostBehind: 'layers-outline',
  random: 'shuffle-outline',
};

function shortDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(intlTag(currentLocale()), { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The actual next episode, respecting season structure when we know it.
 * null = caught up (nothing left); 'unknown' = no metadata yet, structure
 * unverifiable — never invent episodes off it. */
function realNext(sp: ShowProgress): { season: number; episode: number } | null | 'unknown' {
  const m = showMeta(sp.tvdbId);
  if (!m) return 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  let s = sp.nextSeason;
  let e = sp.nextEpisode;
  for (;;) {
    const count = m.seasons[String(s)]?.count ?? 0;
    if (e <= count) {
      // the next episode exists but hasn't aired — that's Upcoming's job,
      // not the watch list's.
      //
      // NO AIR DATE COUNTS AS NOT AIRED. TheTVDB lists a season the moment it
      // is announced, with its episodes carrying no date yet, so `em` existed,
      // `em.air` was null, this guard was skipped and a finished show was told
      // to watch S04E01 of a season that does not exist (reported on Foundation
      // by two testers). An episode nobody can watch is never the next one, and
      // that is the same standard as the verification guard below: suggest only
      // what we can verify.
      const em = m.episodes[`${s}-${e}`];
      if (!em?.air || em.air > today) return null;
      // verification guard: when this show's episode map is populated but has
      // NOTHING for this episode, the season count is lying (a wrong metadata
      // match once let a user check off FROM S04E19…E28 — episodes that don't
      // exist). Suggest only what we can verify; never invent history.
      if (!em && Object.keys(m.episodes).length > 0) return null;
      return { season: s, episode: e };
    }
    const later = Object.keys(m.seasons)
      .map(Number)
      .filter((n) => n > s)
      .sort((a, b) => a - b);
    if (later.length === 0) return null;
    s = later[0];
    e = 1;
  }
}

/** The season/episode a card is really pointing at: the verified next episode
 * when metadata allows it, else the raw maxEp+1 counter. Everything on a card —
 * the code, the still, the tap target — must resolve through this one helper,
 * or the card reads "S06 | E01" while the tap opens "S05 | E25" of a
 * 24-episode season. */
function nextCoords(sp: ShowProgress, next: ReturnType<typeof realNext>): { season: number; episode: number } {
  return next && next !== 'unknown'
    ? { season: next.season, episode: next.episode }
    : { season: sp.nextSeason, episode: sp.nextEpisode };
}

function code(sp: ShowProgress, resolved?: ReturnType<typeof realNext>): string {
  const { season, episode } = nextCoords(sp, resolved ?? realNext(sp));
  return `S${String(season).padStart(2, '0')} | E${String(episode).padStart(2, '0')}`;
}

/** episodes remaining — "+139" on the real app's cards; aired only, so a
 * caught-up show never shows a phantom remainder */
function episodesLeft(sp: ShowProgress): number | null {
  const total = airedTotalOf(sp.tvdbId);
  if (!total) return null;
  return Math.max(total - Math.max(sp.watched, sp.episodesSeen), 0);
}

type Row =
  | { type: 'pill'; key: string; label: string }
  | { type: 'card'; key: string; sp: ShowProgress }
  | { type: 'grid'; key: string; shows: ShowProgress[] };

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function ShowsScreen() {
  const plus = usePlus();
  const fullWidth = useScreenWidth();
  // OPEN ON ITS SIDE, TWO PANES. The list stays on the left, sized to its half
  // so nothing crosses the fold; a tapped show fills the right (see ShowPane).
  const half = useFoldHalf();
  const W = half ?? fullWidth;
  const [picked, setPicked] = useState<number | null>(null);
  const openShow = (id: number) => {
    if (half != null) setPicked(id);
    else router.push(`/show/${id}`);
  };
  // the Watch List's rows and grid run full width (no ContentColumn cap) —
  // these are repeated rows/tiles, not prose, so a tablet should show MORE of
  // them rather than a narrow capped column. The column count derives from
  // the screen width (window minus side safe-area insets). On a phone this is unchanged from before.
  const gridCols = gridGeometry(W, space.md, 3).cols;
  const [tab, setTab] = useState<(typeof TABS)[number]>('Watch List');
  // The Upcoming widget's tap: `opentv://shows?tab=upcoming`.
  const { tab: wantedTab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (wantedTab === 'upcoming') setTab('Upcoming');
  }, [wantedTab]);
  const [view, setView] = useState<'list' | 'grid'>(() => (getMeta('showsView') === 'grid' ? 'grid' : 'list'));
  // A FREE USER CAN CLOSE TONIGHT. For them it opens the paywall, and a row
  // at the top of every visit that cannot be put away reads as an ad (mike,
  // 12 Oct). Plus keeps it: it is their feature, not an offer.
  const [tonightClosed, setTonightClosed] = useState(() => getMeta('tonightRowClosed') === '1');
  const [tonightH, setTonightH] = useState(0);
  const [tick, setTick] = useState(0);
  // The posters' bars are empty while the library fills: redraw when it lands.
  const filling = useMetaFillRunning();
  useEffect(() => {
    if (!filling) setTick((t) => t + 1);
  }, [filling]);
  // Which focus this is — the metadata pass below runs once per focus, NOT on
  // `tick`: a landed batch bumps `tick` to redraw, and when that also started
  // the next batch the tab walked the whole stale library twelve shows at a
  // time, every one of them at once, on every visit.
  const [focusPass, setFocusPass] = useState(0);
  // Read once into state and written back on every change: the rows memo below
  // depends on it, which is how a new choice redraws the list (React Compiler —
  // a render-time getMeta would be memoised past the change).
  const [sort, setSort] = useState<WatchListSort>(() => validWatchListSort(getMeta('watchListSort')));
  const [sortOpen, setSortOpen] = useState(false);
  // A new shuffle each time Random is chosen; see sortWatchList.
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now() & 0xffff);

  // re-read the library whenever this tab regains focus — a show deleted or
  // unfollowed on its page must disappear from here immediately
  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
      setFocusPass((p) => p + 1);
    }, []),
  );

  const rows = useMemo<Row[]>(() => {
    // completed / caught-up shows have nothing to watch next — the Watch List
    // only queues shows with episodes remaining, like the real app
    const all = getShowProgress().filter(
      (s) => !s.archived && (s.followed || s.watched > 0 || s.episodesSeen > 0) && realNext(s) !== null,
    );
    const withActivity = all
      .filter((s) => s.lastWatchedAt != null)
      .sort(
        (a, b) => b.lastWatchedAt!.localeCompare(a.lastWatchedAt!) || b.watched - a.watched,
      );
    // Watch Next = shows active within ~30 days of your newest watch —
    // verified against the real app: AT, Spider-Noir, Noddy, Family Matter
    // in Watch Next; Record of Ragnarok leads "haven't watched for a while"
    const newestTs = withActivity.length
      ? Date.parse(withActivity[0].lastWatchedAt!.replace(' ', 'T'))
      : 0;
    const isRecent = (s: ShowProgress) =>
      newestTs - Date.parse(s.lastWatchedAt!.replace(' ', 'T')) < 30 * 24 * 3600 * 1000;
    const watchNext = withActivity.filter(isRecent).slice(0, 10);
    const stale = [
      ...withActivity.filter((s) => !watchNext.includes(s)),
      ...all.filter((s) => s.lastWatchedAt == null && (s.episodesSeen > 0 || s.watched > 0)),
    ];
    const notStarted = all.filter((s) => s.lastWatchedAt == null && s.episodesSeen === 0 && s.watched === 0);

    /*
     * A CHOSEN SORT IS ONE LIST, NAMED BY ITS PILL. The three sections are an
     * answer to "what was I watching lately", and re-ordering inside each of
     * them would answer neither question. The pill carries the sort's name
     * where WATCH NEXT was, so nobody wonders where their sections went.
     *
     * Measured from exactly what the card prints: the air date of the episode
     * the card points at (via the same `nextCoords`), and the same "+N".
     */
    const sections: [string, ShowProgress[]][] =
      sort === 'recent'
        ? [
            [t('shows.sectionWatchNext'), watchNext],
            [t('shows.sectionStale'), stale],
            [t('shows.sectionNotStarted'), notStarted],
          ]
        : [
            [
              t(`watchListSort.${sort}`),
              sortWatchList(
                all.map((sp) => {
                  const next = realNext(sp);
                  const c = nextCoords(sp, next);
                  return {
                    sp,
                    name: sp.name,
                    lastWatchedAt: sp.lastWatchedAt,
                    started: sp.lastWatchedAt != null || sp.episodesSeen > 0 || sp.watched > 0,
                    nextAir: next === 'unknown' ? null : (episodeMeta(sp.tvdbId, c.season, c.episode)?.air ?? null),
                    left: episodesLeft(sp),
                  };
                }),
                sort,
                shuffleSeed,
              ).map((x) => x.sp),
            ],
          ];

    const out: Row[] = [];
    for (const [label, shows] of sections) {
      if (!shows.length) continue;
      out.push({ type: 'pill', key: `pill-${label}`, label });
      if (view === 'list') {
        for (const sp of shows) out.push({ type: 'card', key: String(sp.tvdbId), sp });
      } else {
        chunk(shows, gridCols).forEach((group, i) =>
          out.push({ type: 'grid', key: `${label}-row-${i}`, shows: group }),
        );
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tick, gridCols, sort, shuffleSeed]);

  const markNext = (sp: ShowProgress) => {
    const next = realNext(sp);
    if (next === null) return;
    if (next === 'unknown') {
      // metadata hasn't loaded — marking blind here once fabricated ghost
      // episodes (FROM S04E19…E28). Open the show instead: the visit fetches
      // the real structure, and marking resumes verified
      openShow(sp.tvdbId);
      return;
    }
    markWatchedWithPrompt(sp.tvdbId, next.season, next.episode, () => setTick((t) => t + 1));
  };

  // shows imported but never opened have no metadata yet — without it the
  // watch list can't know where seasons end (the "ghost episodes" bug). And
  // metadata frozen at its first fetch never learns about new seasons, so
  // stale entries ride the same background sweep — a batch at a time, each
  // show once per session.
  // libraries imported before 1.1.1 have no preserved original export, so
  // silent self-repair can't reach them — one guided re-import fixes that
  // forever (and imports are merge-safe: nothing gets erased or duplicated)
  const [needsOriginal, setNeedsOriginal] = useState(false);
  /*
   * AN IMPORT THAT KEPT THE OPINIONS AND LOST THE HISTORY.
   *
   * Read on focus rather than in render: three COUNTs, and the Compiler would
   * hold the first answer past the re-import that fixes it — which is the one
   * moment this must change.
   */
  const [lostHistory, setLostHistory] = useState(false);
  /* The importer's own counts, so the banner can name the failure rather than
     only report it. Absent on a library imported before this shipped. */
  const [diagnosis, setDiagnosis] = useState<{ verdict?: string; episodeRows?: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      try {
        const counts = archiveCounts();
        setLostHistory(
          importLostHistory({
            owner: libraryOwner(),
            episodes: getTotals().episodes,
            moviesWatched: getMovieTotals().watched,
            ratings: counts.episodeRatings + counts.movieRatings,
            comments: counts.comments,
          }),
        );
        const raw = getMeta('importDiagnosis');
        setDiagnosis(raw ? (JSON.parse(raw) as { verdict?: string; episodeRows?: number }) : null);
      } catch {
        // A banner is never worth a crash on the first screen of the app.
      }
    }, []),
  );
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (libraryOwner() !== 'imported') return;
        if ((await hasOriginalZip()) === 'no' && alive) setNeedsOriginal(true);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  const metaTried = useRef(new Set<number>());
  useEffect(() => {
    const wanted = getShowProgress()
      .filter((s) => {
        if (!(s.followed || s.watched > 0 || s.episodesSeen > 0) || metaTried.current.has(s.tvdbId)) return false;
        const m = showMeta(s.tvdbId);
        return m == null || showMetaIsStale(m);
      })
      .slice(0, 12);
    if (wanted.length === 0) return;
    for (const s of wanted) metaTried.current.add(s.tvdbId);
    // Three at a time, like every other metadata pass: each fetchShowMeta is
    // itself several requests, and twelve at once queued the tab's own
    // artwork behind them.
    void pool(wanted, (s) => fetchShowMeta(s.tvdbId), 3).then((results) => {
      /*
       * A FETCH THAT FAILED IS NOT A FETCH THAT HAPPENED.
       *
       * `metaTried` was stamped before the request and `allSettled` swallows
       * rejections, so one bad response meant that show was never asked about
       * again for the rest of the session. Reported as "One Piece shows no +20
       * badge": `airedTotalOf` returns nothing without metadata, deliberately,
       * so a caught-up show never displays a phantom remainder — and a show
       * whose fetch had quietly failed looked exactly the same.
       *
       * Failures are forgotten so a later pass can try again. NO TICK when
       * nothing arrived, which is what keeps this from spinning: the effect
       * runs once per focus, so a batch that failed entirely simply waits for
       * the next focus rather than retrying immediately, for ever.
       */
      let landed = 0;
      results.forEach((r, i) => {
        const id = wanted[i]!.tvdbId;
        if (r != null && showMeta(id) != null) landed++;
        else metaTried.current.delete(id);
      });
      if (landed > 0) setTick((t) => t + 1);
    });
  }, [focusPass]);

  // WATCHED HISTORY lives above WATCH NEXT: the list opens anchored at
  // WATCH NEXT and scrolling up reveals older and older watches — all the
  // way back to the first episode ever. Rows load in chunks as you climb,
  // with the scroll position compensated so nothing jumps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historyAll = useMemo(() => getHistory(), [tick]);
  const [histCount, setHistCount] = useState(30);
  const history = useMemo(() => historyAll.slice(0, histCount).reverse(), [historyAll, histCount]);
  const listRef = useRef<FlatList<Row>>(null);
  const anchored = useRef(false);
  // Where WATCH NEXT starts (the history header's height), for the re-tap below.
  const watchNextY = useRef(0);
  const scrollY = useRef(0);
  const contentH = useRef(0);
  const pendingGrow = useRef<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const upcoming = useMemo(() => upcomingEpisodes(), [tick]);

  const onListScroll = (y: number) => {
    scrollY.current = y;
    if (view === 'list' && y < 500 && pendingGrow.current == null && histCount < historyAll.length) {
      pendingGrow.current = contentH.current;
      setHistCount((c) => Math.min(c + 100, historyAll.length));
    }
  };
  const onListSize = (h: number) => {
    if (pendingGrow.current != null) {
      const delta = h - pendingGrow.current;
      pendingGrow.current = null;
      if (delta > 0) listRef.current?.scrollToOffset({ offset: scrollY.current + delta, animated: false });
    }
    contentH.current = h;
  };

  // UX #5: hidden while there is nothing to watch — it was a fresh start's
  // first tappable row, and for a free user it opened the paywall.
  const showTonight = rows.length > 0 && (plus || !tonightClosed);
  const tonightPad = showTonight ? tonightH : 0;
  // The native tab bar floats over the list; its height is in the bottom inset.
  const tabBarSpace = useSafeAreaInsets().bottom;

  const pickedShow = picked == null ? null : (getShowProgress().find((p) => p.tvdbId === picked) ?? null);
  return (
    <Screen>
      <View style={half != null ? styles.split : styles.single}>
      <View style={half != null ? { width: half } : styles.single}>
      <TopTabs
        tabs={TABS}
        labels={{ 'Watch List': t('shows.tabs.watchList'), Upcoming: t('shows.tabs.upcoming') }}
        active={tab}
        onChange={(nextTab) => {
          // TAPPING THE TAB YOU ARE ON goes back to WATCH NEXT, the way TV Time
          // did: after climbing into the history there was no way back down
          // but scrolling the whole climb again.
          if (nextTab === 'Watch List' && tab === 'Watch List') {
            listRef.current?.scrollToOffset({ offset: watchNextY.current, animated: true });
            return;
          }
          if (nextTab === 'Watch List') anchored.current = false;
          setTab(nextTab);
        }}
      />

      {needsOriginal && (
        <Pressable style={styles.upgradeBanner} onPress={() => router.push('/import')} accessibilityRole="button">
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.yellow} />
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>{t('shows.upgradeBannerTitle')}</Text>
            <Text style={styles.upgradeText}>{t('shows.upgradeBannerBody')}</Text>
          </View>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.dim} />
        </Pressable>
      )}

      {/* Above the list rather than in its header: ListHeaderComponent is
          measured to anchor the scroll past watched history, and anything else
          inside it moves that anchor. */}
      {/* SAID OUT LOUD, because the alternative is what it did to the first
          person outside the test accounts who joined the community: their
          ratings and comments went up, their shelves could not, and their
          profile showed nothing with no explanation anywhere. The phone knew.
          It just never said. */}
      {lostHistory && (
        <Pressable style={styles.upgradeBanner} onPress={() => router.push('/import')} accessibilityRole="button">
          <Ionicons name="alert-circle-outline" size={20} color={colors.yellow} />
          <View style={{ flex: 1 }}>
            <Text style={styles.upgradeTitle}>{t('shows.lostHistoryTitle')}</Text>
            <Text style={styles.upgradeText}>{t('shows.lostHistoryBody')}</Text>
            {/* The numbers, when this build was the one that imported. They are
                what turns "it did not work" into a bug somebody can name. */}
            {diagnosis?.verdict === 'episodes_all_rejected' && (
              <Text style={styles.upgradeText}>
                {t('shows.lostHistoryRejected', { rows: diagnosis.episodeRows ?? 0 })}
              </Text>
            )}
            {diagnosis?.verdict === 'no_episode_file' && (
              <Text style={styles.upgradeText}>{t('shows.lostHistoryNoFile')}</Text>
            )}
          </View>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.dim} />
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
      {tab === 'Watch List' ? (
        <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          // TV Time: black cards on a grey page, not grey cards on black.
          style={{ backgroundColor: colors.panel }}
          data={rows}
          keyExtractor={(r) => r.key}
          onScroll={(e) => onListScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          onContentSizeChange={(_, h) => onListSize(h)}
          ListHeaderComponent={
            <View
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                watchNextY.current = h > 12 ? h : 0;
                if (anchored.current) return;
                anchored.current = true;
                if (h > 12) listRef.current?.scrollToOffset({ offset: h, animated: false });
              }}>
              {view === 'list' && history.length > 0 && (
                <>
                  <View style={styles.pillRow}>
                    <Text style={styles.sectionPill} accessibilityRole="header">
                      {t('shows.watchedHistorySection')}
                    </Text>
                  </View>
                  {history.map((w, i) => {
                    const em = episodeMeta(w.showId, w.season, w.episode);
                    const title = em?.title ?? t('show.episodeFallbackTitle', { n: w.episode });
                    return (
                      /*
                       * NOT AN ELEMENT ITSELF: see `a11y.ts`. The card holds the
                       * mark-watched circle, the single most-pressed control in
                       * the app, and a card that is one VoiceOver element hides
                       * everything inside it. So the circle stands on its own
                       * and the text block is the button that opens the episode
                       * (a double-tap on it lands on this Pressable), with "open
                       * the show" as its custom action in place of the pill.
                       */
                      <Pressable
                        key={`h${i}`}
                        style={[styles.card, styles.histCard]}
                        accessible={false}
                        // Android ignores accessible={false} on a clickable view:
                        // TalkBack stopped on the bare frame and said only
                        // "double tap". "no" hides the frame and keeps its children.
                        importantForAccessibility="no"
                        onPress={() => router.push(`/episode/${w.showId}-s${w.season}e${w.episode}`)}>
                        <View style={styles.thumb} {...a11yHidden()}>
                          {em?.still ? (
                            <Image source={{ uri: em.still }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />
                          ) : (
                            <Text style={styles.thumbText}>{w.name.slice(0, 2).toUpperCase()}</Text>
                          )}
                        </View>
                        <View
                          style={styles.cardBody}
                          accessible
                          accessibilityRole="button"
                          accessibilityLabel={[w.name, t('a11y.seasonEpisode', { season: w.season, episode: w.episode }), title].join(', ')}
                          {...a11yAction('openShow', t('a11y.openShow'), () => openShow(w.showId))}>
                          <Pressable style={styles.showPill} onPress={() => openShow(w.showId)} accessibilityRole="button" accessibilityLabel={w.name}>
                            <Text style={styles.showPillText} numberOfLines={1}>
                              {w.name.toUpperCase()} ›
                            </Text>
                          </Pressable>
                          <Text style={styles.epCode}>
                            S{String(w.season).padStart(2, '0')} | E{String(w.episode).padStart(2, '0')}
                          </Text>
                          <Text style={styles.epSub} numberOfLines={1}>
                            {title}
                          </Text>
                        </View>
                        <View style={{ paddingEnd: 12 }}>
                          <CheckCircle
                            watched
                            opensMarkAs
                            what={[w.name, t('a11y.seasonEpisode', { season: w.season, episode: w.episode })].join(', ')}
                            onPress={() => router.push(`/mark-as?show=${w.showId}&s=${w.season}&e=${w.episode}`)}
                          />
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
              <View style={{ height: 6 }} />
            </View>
          }
          contentContainerStyle={rows.length === 0 ? { paddingBottom: 24 + tabBarSpace, flexGrow: 1 } : { paddingBottom: 24 + tabBarSpace, paddingTop: tonightPad }}
          ListEmptyComponent={
            <EmptyState
              title={t('shows.emptyTrackingTitle')}
              caption={t('shows.emptyTrackingCaption')}
              cta={t('pickShows.title')}
              onPress={() => router.push('/pick-shows')}
            />
          }
          renderItem={({ item, index }) => {
            if (item.type === 'pill') {
              return (
                <View style={styles.pillRow}>
                  <Text style={styles.sectionPill} accessibilityRole="header">
                    {item.label.toLocaleUpperCase(currentLocale())}
                  </Text>
                  {/*
                    PART OF THE FIRST HEADER, NOT FLOATING OVER THE LIST (2.0.3).
                    They were an absolute overlay at a fixed top, which is only the
                    WATCH NEXT line while the list sits exactly at its anchor; with
                    the watched history scrolled into view they drew on top of a
                    row, over its green check (seen 25 Oct on iPhone Duo, inner
                    display upright). Inside the first pill's row they scroll with
                    the heading they belong to, at any width. The sort turns yellow
                    while it is not the default.
                  */}
                  {index === 0 && (
                    <View style={styles.gridToggle}>
                      <Pressable
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('watchListSort.a11y', { sort: t(`watchListSort.${sort}`) })}
                        onPress={() => setSortOpen(true)}>
                        <Ionicons name="swap-vertical" size={22} color={sort === 'recent' ? colors.text : colors.yellow} />
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t(view === 'list' ? 'a11y.showAsGrid' : 'a11y.showAsList')}
                        onPress={() => {
                          const next = view === 'list' ? 'grid' : 'list';
                          setView(next);
                          setMeta('showsView', next);
                        }}>
                        <Ionicons name={view === 'list' ? 'grid' : 'list'} size={22} color={colors.text} />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }
            if (item.type === 'card') {
              const sp = item.sp;
              const next = realNext(sp);
              const { season: nextS, episode: nextE } = nextCoords(sp, next);
              const em = episodeMeta(sp.tvdbId, nextS, nextE);
              const left = episodesLeft(sp);
              // SEASON-LEVEL: has the season this card points at finished
              // airing? Null when the metadata cannot say, and then nothing
              // is claimed — see `seasonAirState`.
              const air = next === 'unknown' ? null : seasonAirState(showMeta(sp.tvdbId), nextCoords(sp, next).season, new Date().toISOString().slice(0, 10));
              const thumbUri = em?.still ?? sp.posterUrl;
              const sub =
                em?.title ?? (sp.lastWatchedAt ? t('shows.lastWatched', { date: shortDate(sp.lastWatchedAt) }) : t('shows.notStartedYet'));
              return (
                // Same shape as the history card above: the circle is its own
                // element, the text block is the button.
                <Pressable
                  style={styles.card}
                  accessible={false}
                  importantForAccessibility="no"
                  onPress={() =>
                    // metadata still loading — the coords are an unverified
                    // guess, so open the show (which fetches the real
                    // structure) rather than a possibly-nonexistent episode,
                    // same guard markNext uses
                    next === 'unknown'
                      ? openShow(sp.tvdbId)
                      : router.push(`/episode/${sp.tvdbId}-s${nextS}e${nextE}`)
                  }
                >
                  <View style={styles.thumb} {...a11yHidden()}>
                    {thumbUri ? (
                      <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />
                    ) : (
                      <Text style={styles.thumbText}>{sp.name.slice(0, 2).toUpperCase()}</Text>
                    )}
                    {/*
                      ON THE ARTWORK, NOT ON THE LINE OF TEXT.
                      
                      This started life inside the episode line, in the same
                      single-line Text as the code and the unwatched count, and
                      the line ran out exactly there: it shipped reading "All ..."
                      and "Al…". Moving it to its own pill in that row only moved
                      the damage — the EPISODE NUMBER started truncating instead,
                      which is worse, because the code is the one thing on the card
                      that cannot be guessed from anything else.
                      
                      A poster corner competes with nothing. Reported from the
                      community with mock-ups, and this was their first suggestion.
                    */}
                    {air?.state === 'fullyAired' ? (
                      <View style={styles.airedTag}>
                        <Text style={styles.airedTagText}>{t('shows.allAired')}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={styles.cardBody}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={[
                      sp.name,
                      t('a11y.seasonEpisode', { season: nextS, episode: nextE }),
                      sub,
                      left != null && left > 0 ? t('a11y.episodesLeft', { count: left }) : null,
                      air?.state === 'fullyAired' ? t('shows.allAired') : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {...a11yAction('openShow', t('a11y.openShow'), () => openShow(sp.tvdbId))}>
                    <Pressable style={styles.showPill} onPress={() => openShow(sp.tvdbId)} accessibilityRole="button" accessibilityLabel={sp.name}>
                      <Text style={styles.showPillText} numberOfLines={1}>
                        {sp.name.toUpperCase()} ›
                      </Text>
                    </Pressable>
                    {/*
                      A ROW, NOT ONE LINE OF TEXT.
                      
                      All three of these lived inside a single `numberOfLines={1}`
                      Text, so on a narrow phone the line ran out exactly where the
                      aired state is — and the badge somebody asked for shipped as
                      "All ..." and "Al…". Reported from the community with
                      mock-ups, and they were right that it looked broken.
                      
                      The episode code is the only part that may shrink, because it
                      is the one part that can be guessed from the rest of the card.
                      The count and the aired state are laid out at their natural
                      width and never truncate.
                    */}
                    <Text style={styles.epCode} numberOfLines={1}>
                      {code(sp, next)}
                      {left != null && left > 0 && <Text style={styles.epPlus}>  +{left}</Text>}
                      {/* Only the "still coming" case stays on this line: it is a
                          number, it is short, and there is nothing to collide with
                          now that the aired badge has moved to the poster. */}
                      {air && air.state !== 'fullyAired' ? (
                        <Text style={styles.epPlus}>  {t('shows.toCome', { count: air.toCome })}</Text>
                      ) : null}
                    </Text>
                    <Text style={styles.epSub} numberOfLines={1}>
                      {sub}
                    </Text>
                  </View>
                  <View style={{ paddingEnd: 12 }}>
                    <CheckCircle
                      onPress={() => markNext(sp)}
                      what={[sp.name, t('a11y.seasonEpisode', { season: nextS, episode: nextE })].join(', ')}
                    />
                  </View>
                </Pressable>
              );
            }
            return (
              <View style={styles.gridRow}>
                {item.shows.map((sp) => (
                  <Pressable
                    key={sp.tvdbId}
                    style={{ flex: 1 }}
                    onPress={() => openShow(sp.tvdbId)}
                    accessibilityRole="button"
                    accessibilityLabel={posterSpeech(sp.name, { progress: progressOf(sp) })}>
                    <Poster name={sp.name} uri={sp.posterUrl} progress={progressOf(sp)} progressColor={progressColorOf(sp)} animateProgress />
                  </Pressable>
                ))}
                {item.shows.length < gridCols &&
                  Array.from({ length: gridCols - item.shows.length }).map((_, i) => <View key={i} style={{ flex: 1 }} />)}
              </View>
            );
          }}
        />
        <ActionSheet
          visible={sortOpen}
          title={t('filters.sortByTitle')}
          onClose={() => setSortOpen(false)}
          // BACK TO "RECENT" IN ONE TAP: a small button on the title line,
          // only while another sort is on (22 Oct)
          titleAction={
            sort !== 'recent'
              ? {
                  label: t('watchListSort.resetShort'),
                  a11y: t('watchListSort.reset'),
                  onPress: () => {
                    setSort('recent');
                    setMeta('watchListSort', 'recent');
                  },
                }
              : undefined
          }
          actions={[
            ...WATCH_LIST_SORTS.map((s) => ({
            text: t(`watchListSort.${s}`),
            icon: SORT_ICON[s],
            selected: s === sort,
            onPress: () => {
              if (s === 'random') setShuffleSeed(Date.now() & 0xffff);
              setSort(s);
              setMeta('watchListSort', s);
            },
          })),
          ]}
        />
        </View>
      ) : upcoming.length === 0 ? (
        <View style={{ flex: 1, paddingTop: tonightPad }}>
          <EmptyState
            title={t('shows.emptyUpcomingTitle')}
            caption={t('shows.emptyUpcomingCaption')}
            cta={t('shows.browseAllShows')}
            onPress={() => router.push('/discover-more')}
          />
        </View>
      ) : (
        <FlatList
          style={{ backgroundColor: colors.panel }}
          data={upcoming}
          keyExtractor={(u) => `${u.showId}-${u.season}-${u.episode}`}
          contentContainerStyle={{ paddingBottom: 90 + tabBarSpace, paddingTop: tonightPad }}
          renderItem={({ item: u, index }) => {
            const first = index === 0 || upcoming[index - 1].air !== u.air;
            const d = new Date(`${u.air}T12:00:00`);
            const today = new Date();
            const days = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86400000);
            const label =
              days <= 0 ? t('shows.today') : days === 1 ? t('shows.tomorrow') : d.toLocaleDateString(intlTag(currentLocale()), { weekday: 'short', month: 'short', day: 'numeric' });
            const title = u.title ?? t('show.episodeFallbackTitle', { n: u.episode });
            return (
              <View>
                {first && (
                  <Text style={styles.upcomingDate} accessibilityRole="header">
                    {label}
                  </Text>
                )}
                <Pressable
                  style={styles.card}
                  accessibilityRole="button"
                  accessibilityLabel={[u.showName, t('a11y.seasonEpisode', { season: u.season, episode: u.episode }), title].join(', ')}
                  onPress={() => (half != null ? setPicked(u.showId) : router.push(`/episode/${u.showId}-s${u.season}e${u.episode}`))}>
                  <View style={styles.thumb}>
                    {(u.still ?? u.poster) && (
                      <Image source={{ uri: u.still ?? u.poster! }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" />
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.showPill}>
                      <Text style={styles.showPillText} numberOfLines={1}>{u.showName.toUpperCase()} ›</Text>
                    </View>
                    <Text style={styles.epCode}>
                      S{String(u.season).padStart(2, '0')} | E{String(u.episode).padStart(2, '0')}
                    </Text>
                    <Text style={styles.epSub} numberOfLines={1}>{title}</Text>
                  </View>
                </Pressable>
              </View>
            );
          }}
        />
      )}
      {/* THE ONE PLACE IT WILL BE FOUND. Lists shipped complete and reachable
          from a single row on the profile, and the result was a full feature
          nobody knew existed. This is the landing tab, so this is where the
          question gets asked. */}
      {/* FLOATS OVER THE LIST (22 Oct): it sat in a black band of its own
          above the grey list. Now the list's grey runs up to the tabs and
          rows slide under the card; the list's top padding is the card's
          measured height, so at rest nothing is hidden. Rendered after the
          lists so it paints on top on Android too. */}
      {showTonight && (
        <View style={styles.tonightFloat} pointerEvents="box-none" onLayout={(e) => setTonightH(e.nativeEvent.layout.height)}>
          <Pressable style={styles.tonightRow} onPress={() => router.push(plus ? '/tonight' : '/paywall')} accessibilityRole="button">
            <Ionicons name="moon-outline" size={18} color={colors.yellow} />
            <View style={{ flex: 1 }}>
              <Text style={styles.tonightTitle}>{t('tonight.entry')}</Text>
              <Text style={styles.tonightSub}>{t('tonight.entrySub')}</Text>
            </View>
            {plus ? (
              <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.dim} />
            ) : (
              <Pressable
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('whatsNew.close')}
                onPress={() => {
                  setMeta('tonightRowClosed', '1');
                  setTonightClosed(true);
                }}>
                <Ionicons name="close" size={18} color={colors.dim} />
              </Pressable>
            )}
          </Pressable>
        </View>
      )}
      </View>
      </View>
      {half != null && (
        <ShowPane show={pickedShow} next={pickedShow ? realNext(pickedShow) : null} />
      )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  single: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  /* Every band on this screen owns its TOP margin and no bottom one, so that
     two in a row are separated once rather than twice. This had it the other
     way round, which left it flush against the tabs above and floating above
     whatever came next. Padding is uniform for the same reason the banner's
     is: an asymmetric inset reads as a mistake at a glance, because it is. */
  tonightFloat: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  tonightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 12,
    marginHorizontal: space.lg,
    marginTop: 8,
  },
  tonightTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  tonightSub: { color: colors.dim, fontSize: 12, lineHeight: 16 },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    marginHorizontal: space.lg,
    marginTop: 8,
    padding: 12,
  },
  upgradeTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  upgradeText: { color: colors.dim, fontSize: 12, lineHeight: 16 },
  pillRow: { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  // TV Time's pill (same as SectionPill in ui.tsx): ~18pt tall, not 23.
  sectionPill: {
    backgroundColor: colors.pillGrey,
    color: colors.text,
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: ls(0.5),
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  gridToggle: { position: 'absolute', end: 14, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 18 },
  // history cards read as "done": dimmed like the real app
  histCard: { opacity: 0.55 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    marginHorizontal: space.md,
    marginBottom: 10,
    overflow: 'hidden',
  },
  // TV Time's artwork: a square the full height of the card (~89pt at 430pt),
  // growing with the card when a PREMIERE tag makes it taller.
  thumb: {
    width: 89,
    minHeight: 89,
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: '#8B98AE', fontSize: 18, fontWeight: '800' },
  cardBody: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12 },
  showPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: '#C9C9CE',
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 9,
  },
  showPillText: { color: colors.text, fontSize: 11, fontWeight: '500', letterSpacing: ls(0.6) },
  epCode: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 7 },
  // Pinned to the foot of the artwork, full width of it, so a long word wraps
  // inside the poster instead of pushing anything around. Solid rather than
  // translucent: it sits over photographs, and 16% green over a bright still is
  // not readable.
  airedTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.green,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  airedTagText: { color: '#0A0A0A', fontSize: 10, fontWeight: '900', letterSpacing: ls(0.3), textAlign: 'center' },
  epPlus: { color: colors.dim, fontSize: 12, fontWeight: '600' },
  aired: { color: colors.green, fontSize: 12, fontWeight: '700' },
  epSub: { color: colors.dim, fontSize: 12.5, marginTop: 2 },
  gridRow: { flexDirection: 'row', gap: 3, marginHorizontal: space.md, marginBottom: 3 },
  upcomingDate: {
    color: colors.yellow,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: ls(0.8),
    textTransform: 'uppercase',
    marginHorizontal: space.md,
    marginTop: 14,
    marginBottom: 8,
  },
});
