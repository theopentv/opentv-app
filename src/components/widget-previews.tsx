/**
 * Live previews for the sections the Profile screen owns.
 *
 * WHY THIS FILE EXISTS. `renderWidget` draws the widgets, and the Add sheet can
 * simply call it. The page's own sections — the heatmap, Stats, Lists, the
 * shelves — are built inside `(tabs)/profile/index.tsx` and handed to the template as
 * slots, because there they carry that screen's navigation: tapping a poster
 * opens the show, tapping Lists opens the Lists screen. Nothing outside that
 * screen can produce one.
 *
 * A preview needs none of that. It needs the same COMPONENTS with the same DATA
 * and no behaviour at all — nothing here is tappable, because a preview that
 * navigates is a preview somebody falls out of. So this reads the database
 * directly and renders the real components, which is why it cannot drift into
 * showing something the profile would not: the drawing is shared, only the
 * wiring is absent.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Poster } from '@/components/poster';
import { StatsRail, type RailItem } from '@/components/profile-sections';
import { renderWidget } from '@/components/profile-widgets';
import { MenuRow } from '@/components/ui';
import { everythingSummary } from '@/everything';
import { serialiseProfileLinks } from '@/pure';
import { getCustomLists, getFavoriteMovies, getFavoriteShows, getMovies, getShowProgress, getTotals } from '@/db';
import { currentLocale, t } from '@/i18n';
import { isSeedLibrary } from '@/library';
import seed from '@/seed';
import { formatCount } from '@/locale-resolve';
import { SHELF_PREFIX, type WidgetSpan } from '@/profile-layout';
import { Heatmap, monthOf } from '@/components/heatmap';
import { clockOf, computeMovieStats, watchDayCounts } from '@/stats-calc';
import { colors, space } from '@/theme';

const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The window each size covers — the same rule the profile applies. */
/** The gap the poster rails use, so a preview lines up with the real thing. */
const GAP = 10;

const monthsFor = (span: WidgetSpan): number => (span === '1x1' ? 1 : span === '2x1' ? 3 : 6);

function HeatmapPreview({ span, width }: { span: WidgetSpan; width: number }) {
  const today = todayISO();
  // Its own end month, so paging inside a preview cannot move the profile.
  const [end, setEnd] = useState(monthOf(today));
  return (
    <Heatmap
      counts={watchDayCounts()}
      accent={colors.yellow}
      months={monthsFor(span)}
      endMonth={end}
      onEndMonth={setEnd}
      today={today}
      maxMonth={monthOf(today)}
      width={width}
    />
  );
}

function StatsPreview({ width }: { width: number }) {
  const totals = getTotals();
  const movie = computeMovieStats();
  const tv = clockOf(totals.minutes);
  /*
   * THE RAIL, because the rail is what the profile draws. A grid of four small
   * cards was briefly shown here and it answered the wrong question: the
   * preview's promise is "this is what lands on your page", and what lands is
   * the two wide cards with the rest behind a scroll.
   */
  return (
    /*
     * WRAPPED, SO THE CENTRING CAN REACH IT. The preview card centres its body
     * — which is why the Shows posters sit in the middle — but a ScrollView is
     * stretched by its parent rather than measured, so the rail filled the card
     * top to bottom and its content clung to the top. A plain View around it is
     * something the centring can hold.
     */
    <View>
    <StatsRail
      contentWidth={width}
      cards={[
        { key: 'tv', title: t('profile.tvTimeCard'), kind: 'clock', ...tv },
        {
          key: 'eps',
          title: t('profile.episodesWatchedCard'),
          kind: 'number',
          value: formatCount(totals.episodes, currentLocale()),
        },
        { key: 'mv', title: t('profile.movieTimeCard'), kind: 'clock', ...movie.clock },
        { key: 'mvn', title: t('profile.moviesWatchedCard'), kind: 'number', value: formatCount(movie.watched, currentLocale()) },
      ]}
    />
    </View>
  );
}

/** The posters a given shelf would hold, in the order the profile shows them. */
function shelfItems(key: string): RailItem[] {
  // The profile falls back to the bundled seed until an import arrives; a
  // preview that does not is blank on exactly the phones the profile is not.
  if (isSeedLibrary()) {
    if (key === 'shows') return seed.shows.map((x) => ({ key: x.name, name: x.name, uri: x.posterUrl }));
    if (key === 'movies') return seed.movies.map((x) => ({ key: x.name, name: x.name, uri: x.poster ?? null }));
  }
  if (key === 'shows') {
    return getShowProgress()
      .slice(0, 12)
      .map((sp) => ({ key: String(sp.tvdbId), name: sp.name, uri: sp.posterUrl }));
  }
  if (key === 'fav-shows') {
    return getFavoriteShows()
      .slice(0, 12)
      .map((f) => ({ key: String(f.tvdbId), name: f.name, uri: f.posterUrl }));
  }
  if (key === 'movies') {
    return getMovies()
      .filter((m) => m.watchedAt != null)
      .slice(0, 12)
      .map((m) => ({ key: m.name, name: m.name, uri: m.poster }));
  }
  if (key === 'fav-movies') {
    return getFavoriteMovies()
      .slice(0, 12)
      .map((m) => ({ key: m.name, name: m.name, uri: m.poster }));
  }
  return [];
}

/**
 * The first list's posters, drawn as the profile's collage draws them.
 *
 * THE SAME SOURCE AS THE PROFILE, seed included. The profile shows the bundled
 * seed lists until an import brings real ones, so a preview that read only
 * `getCustomLists()` was blank on exactly the phones the profile was not.
 */
function listItems(): { name: string; poster: string | null }[] {
  const lists = isSeedLibrary() ? seed.lists : getCustomLists();
  const first = lists[0];
  return ((first?.items ?? []) as { name: string; poster: string | null }[]).slice(0, 4);
}

/**
 * A preview for one of the profile's own sections, or null when there is no
 * sensible one — the banner and bio are somebody's identity rather than a
 * component, and Followers is a number this screen cannot know offline.
 */
export function previewSlot(id: string, span: WidgetSpan, width: number): ReactNode {
  if (id === 'activity') return <HeatmapPreview span={span} width={width} />;
  if (id === 'stats') return <StatsPreview width={width} />;
  if (id === 'lists') {
    /*
     * DATA FIRST, ELEMENT SECOND. This used to return a <ListsPreview/> whose
     * body might render null — but the ELEMENT is truthy either way, so the
     * caller's `?? outline` fallback never fired and an empty library got a
     * blank sheet instead of the named outline. Whether there is anything to
     * show has to be decided out here, before a component exists to be truthy.
     */
    const items = listItems();
    if (items.length === 0) return null;
    const cell = (width - 3 * 2) / 4;
    return (
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {items.map((it, i) => (
          <View key={`${it.name}-${i}`} style={{ width: cell, height: cell / 0.78 }}>
            <Poster name={it.name} uri={it.poster} aspect={0.78} />
          </View>
        ))}
      </View>
    );
  }
  if (id.startsWith(SHELF_PREFIX)) {
    const items = shelfItems(id.slice(SHELF_PREFIX.length));
    if (items.length === 0) return null;
    /*
     * A PLAIN ROW, NOT THE REAL RAIL.
     *
     * `PosterRail` is a FlatList, and a FlatList inside the preview's horizontal
     * pager is a virtualised list nested in a ScrollView of the same
     * orientation — React Native says so out loud, and it is right: the two
     * fight over the same gesture and the inner one can never measure itself.
     * A preview does not scroll anyway, so it shows the first few posters at
     * the rail's own size and stops.
     */
    const w = Math.floor((width - GAP * 3) / 3.5);
    // HEIGHT SPELLED OUT. A Poster is `flex: 1` inside its cell, which works on
    // the profile because the rail's cells have a measured height — here the
    // parent is content-sized, `flex: 1` means basis 0, and the posters
    // collapsed to nothing. Same disease as the widget previews, same cure.
    const h = Math.round(w * 1.5);
    return (
      <View style={{ flexDirection: 'row', gap: GAP, overflow: 'hidden' }}>
        {items.slice(0, 4).map((it) => (
          <View key={it.key} style={{ width: w, height: h }}>
            <Poster name={it.name} uri={it.uri} />
          </View>
        ))}
      </View>
    );
  }
  return null;
}

/*
 * ── SAMPLES (2.0.3) ─────────────────────────────────────────────────────────
 *
 * THE GALLERY SHOWS EVERY WIDGET AS A PICTURE, and a widget with nothing to say
 * collapses to nothing — which on a new library is most of them. So when the
 * real one is empty, the picker draws it with made-up numbers, the way the iOS
 * gallery shows a weather widget for a city you have never been to.
 *
 * THROUGH THE SAME DRAWING. A sample is handed to `renderWidget` as a published
 * value — the path a visitor's copy takes — so it is the real widget with other
 * numbers in it, never a lookalike that can drift. Posters are the library's
 * own when it has any; a library with none gets the blank poster card.
 */

/** The library's latest posters, for the samples that need pictures. */
function samplePosters(): { key: string; name: string; uri: string | null }[] {
  const real = everythingSummary(4).posters;
  if (real.length > 0) return real;
  return [0, 1, 2, 3].map((i) => ({ key: String(i), name: '', uri: null }));
}

const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Titles for a sample when the library has none of its own. Show names are
 *  names, the same in every language, so they are not in the locale files. */
const SAMPLE_SHOWS = ['Severance', 'The Bear', 'Frieren', 'Slow Horses'];

/** Made-up but plausible values, in exactly the shapes `widgetValue` publishes. */
function sampleValue(id: string): unknown {
  const year = new Date().getFullYear();
  const posters = samplePosters();
  switch (id) {
    case 'since':
      return { year: String(year - 6) };
    case 'character':
      return { name: 'Leslie Knope', show: 'Parks and Recreation' };
    case 'genre':
      return { name: 'Drama', pct: 41 };
    case 'thisYear':
      return { year, n: 214 };
    case 'binge':
      return { n: 9, day: isoDaysAgo(40) };
    case 'finished':
      return { n: 12 };
    case 'rated':
      return { n: 86, avg: 4.1 };
    case 'primeTime':
      return { hour: 21, pct: 34 };
    case 'firstEver':
      return { show: 'Friends', day: `${year - 9}-09-22` };
    case 'watchlist':
      return { n: 17 };
    case 'emotions':
      return { total: 40, top: [{ emotion: 5, n: 18 }, { emotion: 9, n: 12 }, { emotion: 2, n: 6 }] };
    case 'emotionCalendar':
      return { days: Array.from({ length: 60 }, (_, i) => [isoDaysAgo(i * 3), i % 12]) };
    case 'puzzle':
      return {
        days: Array.from({ length: 18 }, (_, i) => [isoDaysAgo(i), (i % 5) + 1]),
        stats: { played: 18, win: 89, avg: 3.4 },
      };
    case 'goal':
      return {
        year,
        cells: [
          { kind: 'films', target: 52, done: 38, delta: 3 },
          { kind: 'episodes', target: 500, done: 410, delta: -12 },
        ],
      };
    case 'together':
      return { shows: [0, 1].map((i) => ({ title: posters[i]?.name || SAMPLE_SHOWS[i], members: i + 2 })) };
    case 'topRated':
      return { eps: posters.map((p, i) => ({ showId: i, show: p.name, poster: p.uri, season: 1, episode: i + 1, stars: 5 - (i % 2), ten: 10 - i })) };
    case 'nowWatching':
      return { shows: posters.map((p, i) => ({ tvdbId: i, name: p.name || SAMPLE_SHOWS[i % SAMPLE_SHOWS.length], poster: p.uri })) };
    case 'everything':
      return { shows: 48, movies: 112, posters: posters.filter((p) => p.uri) };
    case 'artwork':
      return posters[0]?.uri ? { uri: posters[0].uri, name: posters[0].name } : undefined;
    default:
      return undefined;
  }
}

const SAMPLE_LINKS = serialiseProfileLinks([
  { service: 'instagram', url: 'https://www.instagram.com/' },
  { service: 'letterboxd', url: 'https://letterboxd.com/' },
  { service: 'youtube', url: 'https://www.youtube.com/' },
]);

/** A widget drawn with sample numbers, or null when there is no sensible one. */
export function sampleWidget(id: string, span: WidgetSpan): ReactNode {
  // A GIF is a picture in the box, so its sample is the Photo widget's.
  if (id === 'gif') return sampleWidget('artwork', span);
  if (id === 'links') return renderWidget('links', span, true, SAMPLE_LINKS);
  const value = sampleValue(id);
  if (value === undefined) return null;
  return renderWidget(id, span, true, undefined, undefined, { value });
}

/**
 * Samples for the page's own sections that have no live preview: the banner,
 * the bio, the counts band, the timeline row, and Lists with no lists yet.
 * Drawn plainly from the same pieces the page uses, unwired.
 */
export function sampleSlot(id: string, width: number): ReactNode {
  const posters = samplePosters();
  if (id === 'banners') {
    const uri = posters[0]?.uri;
    return (
      <View style={{ width, height: Math.round(width * 0.42), borderRadius: 12, overflow: 'hidden', backgroundColor: colors.raise, justifyContent: 'flex-end', padding: 12 }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={22} color={colors.dim} />
        </View>
      </View>
    );
  }
  if (id === 'intro') {
    // The bio is somebody's own words, so the sample is the SHAPE of a
    // paragraph rather than a sentence put in their mouth.
    return (
      <View style={{ gap: 7, paddingVertical: 4 }}>
        {[0.92, 0.78, 0.55].map((f) => (
          <View key={f} style={{ width: width * f, height: 9, borderRadius: 5, backgroundColor: colors.line }} />
        ))}
      </View>
    );
  }
  if (id === 'counts') {
    const cells = [
      { n: 128, label: t('profile.statFollowing') },
      { n: 96, label: t('profile.statFollowers') },
      { n: 412, label: t('profile.statComments') },
    ];
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6 }}>
        {cells.map((c) => (
          <View key={c.label} style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{formatCount(c.n, currentLocale())}</Text>
            <Text style={{ color: colors.dim, fontSize: 12 }}>{c.label}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (id === 'timeline') return <MenuRow title={t('timeline.entry')} sub={t('timeline.entrySub')} />;
  if (id === 'lists') {
    const cell = (width - 3 * 2) / 4;
    return (
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {posters.map((it) => (
          <View key={it.key} style={{ width: cell, height: cell / 0.78 }}>
            <Poster name={it.name} uri={it.uri} aspect={0.78} />
          </View>
        ))}
      </View>
    );
  }
  return null;
}
