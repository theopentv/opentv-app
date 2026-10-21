/**
 * You against each person you follow: time watched, episodes, films, what you
 * have in common, and how alike your shelves are. Opened from Stats.
 *
 * NO NEW ENDPOINT, AND NOTHING OF YOURS IS SENT. Their side is
 * `GET /v1/profiles/:handle/published`, the very read their profile page
 * makes — so a block, a private profile you have not been let into, and a
 * section they switched off all arrive here already applied by the server, and
 * this screen cannot show more than their profile would. Your side is read from
 * this phone and the arithmetic (`compare-pure.ts`) happens on it.
 *
 * ONE REQUEST PER ROW, AND ONLY FOR ROWS ON SCREEN. A FlatList mounts what is
 * visible; each row asks for its own person when it mounts (and on every
 * focus), and the last answer is kept for the session so it paints at once.
 * Following three hundred people does not mean three hundred requests on open.
 *
 * Somebody who never joined does not get here — the Stats link explains instead
 * — and if they do (a deep link) the screen says the same and asks nothing.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchFollowing, fetchPublishedProfile, type ProfileEdge, type PublishedProfile } from '@/community-profiles';
import { ownShelfKeys } from '@/community-publish';
import { getProfileId, useJoined } from '@/community-session';
import { sideFromPublished, tasteMatch, type CompareSide, type ShelfKeys } from '@/compare-pure';
import { PersonRow } from '@/components/person-row';
import { BlueLink, NavHeader, Screen } from '@/components/ui';
import { getMovieTotals, getTotals } from '@/db';
import { currentLocale, t } from '@/i18n';
import { formatCount } from '@/locale-resolve';
import { PUBLISH_CHUNK } from '@/pure';
import { colors, radius, space } from '@/theme';

/** Published profiles already fetched this session, by handle. */
const seen = new Map<string, PublishedProfile>();

/** At most this many pages of the people you follow. */
// ponytail: 10 pages of the server's page size; page further if anyone follows more
const MAX_PAGES = 10;

type Mine = { side: CompareSide; keys: ShelfKeys };

function readMine(): Mine {
  const tv = getTotals();
  const mv = getMovieTotals();
  return { side: { minutes: tv.minutes + mv.minutes, episodes: tv.episodes, films: mv.watched }, keys: ownShelfKeys() };
}

const num = (n: number | null): string => (n == null ? '—' : formatCount(n, currentLocale()));
const hours = (m: number | null): string => (m == null ? '—' : t('duration.hoursOnly', { h: num(Math.round(m / 60)) }));

function CompareRow({ person, mine }: { person: ProfileEdge; mine: Mine }) {
  const [pub, setPub] = useState<PublishedProfile | null>(() => seen.get(person.handle) ?? null);
  /*
   * ASKED AGAIN ON EVERY FOCUS; the cache is only the first paint. Kept for
   * the session and never refetched, a person who hid a section or blocked you
   * went on showing their old numbers until the app restarted (21 Oct).
   *
   * An empty answer replaces the cached one too: a failure arrives as the same
   * empty shape as a block (the server's 404 is swallowed into it), and stale
   * numbers for somebody who has blocked you are the worse of the two.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchPublishedProfile(person.handle).then((p) => {
        if (p.stats || p.shows.length > 0 || p.movies.length > 0) seen.set(person.handle, p);
        else seen.delete(person.handle);
        if (!cancelled) setPub(p);
      });
      return () => {
        cancelled = true;
      };
    }, [person.handle]),
  );

  const name = person.display_name || `@${person.handle}`;
  const open = () => router.push(`/profile/${encodeURIComponent(person.handle)}`);
  if (!pub) {
    return (
      <View style={styles.card}>
        <PersonRow person={person} onPress={open} right={<ActivityIndicator color={colors.dim} />} />
      </View>
    );
  }

  const theirs = sideFromPublished(pub.stats);
  const match = tasteMatch(
    mine.keys,
    { shows: pub.shows.map((x) => x.target_key), movies: pub.movies.map((x) => x.target_key) },
    PUBLISH_CHUNK,
  );
  const nothing = !pub.stats && pub.shows.length === 0 && pub.movies.length === 0;
  const pct = match.percent == null ? '—' : t('compareFollowing.percent', { pct: num(match.percent) });
  const lines: [string, string, string][] = [
    [t('compareFollowing.time'), hours(mine.side.minutes), hours(theirs.minutes)],
    [t('compareFollowing.episodes'), num(mine.side.episodes), num(theirs.episodes)],
    [t('compareFollowing.films'), num(mine.side.films), num(theirs.films)],
  ];

  return (
    <View style={styles.card}>
      <PersonRow
        person={person}
        sub={nothing ? t('compareFollowing.nothingPublished') : t('compareFollowing.match', { pct })}
        onPress={open}
        right={nothing ? undefined : <Text style={styles.pct}>{pct}</Text>}
      />
      {!nothing && (
        <View style={styles.table}>
          <View style={styles.line} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Text style={styles.label} />
            <Text style={styles.head}>{t('compareFollowing.you')}</Text>
            <Text style={styles.head} numberOfLines={1}>
              {name}
            </Text>
          </View>
          {lines.map(([label, a, b]) => (
            <View
              key={label}
              style={styles.line}
              accessible
              accessibilityLabel={t('compareFollowing.a11yLine', { label, mine: a, name, theirs: b })}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{a}</Text>
              <Text style={styles.value}>{b}</Text>
            </View>
          ))}
          <View style={styles.common} accessible>
            <Text style={styles.commonText}>
              {t('compareFollowing.showsInCommon')}: <Text style={styles.commonNum}>{num(match.showsInCommon)}</Text>
              {'   '}
              {t('compareFollowing.filmsInCommon')}: <Text style={styles.commonNum}>{num(match.filmsInCommon)}</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function CompareScreen() {
  const joined = useJoined();
  // Read once, in an initializer: the library does not change under this
  // screen, and a render-time read is what the React Compiler caches stale.
  const [mine] = useState(readMine);
  const [people, setPeople] = useState<ProfileEdge[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    void (async () => {
      const me = getProfileId();
      const all: ProfileEdge[] = [];
      let cursor: string | null = null;
      try {
        for (let i = 0; i < MAX_PAGES; i++) {
          const page = await fetchFollowing(cursor);
          all.push(...page.items.filter((p) => p.id !== me));
          cursor = page.next_cursor;
          if (!cursor) break;
        }
      } catch {
        // a page that fails after the first still shows what arrived
        if (all.length === 0) {
          if (!cancelled) setFailed(true);
          return;
        }
      }
      if (!cancelled) setPeople(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [joined]);

  const header = (
    <Text style={styles.intro}>{t('compareFollowing.explain')}</Text>
  );

  return (
    <Screen>
      <NavHeader title={t('compareFollowing.title')} />
      {!joined ? (
        <Pressable accessibilityRole="button" style={styles.joinCard} onPress={() => router.push('/join')}>
          <Text style={styles.joinTitle}>{t('compareFollowing.joinTitle')}</Text>
          <Text style={styles.joinBody}>{t('compareFollowing.joinBody')}</Text>
        </Pressable>
      ) : failed ? (
        <Text style={styles.intro}>{t('compareFollowing.failed')}</Text>
      ) : people == null ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.dim} />
      ) : people.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.intro}>{t('compareFollowing.noneFollowed')}</Text>
          <BlueLink label={t('compareFollowing.findPeople')} onPress={() => router.push('/find-people')} trackId="compare_find_people" />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <CompareRow person={item} mine={mine} />}
          contentContainerStyle={{ paddingBottom: 30 }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.dim, fontSize: 13.5, lineHeight: 19, paddingHorizontal: space.lg, paddingVertical: 12 },
  empty: { alignItems: 'center', gap: 8, marginTop: 24 },
  card: { marginHorizontal: space.lg, marginBottom: 12, backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden' },
  pct: { color: colors.yellow, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  table: { paddingHorizontal: space.lg, paddingBottom: 12, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1.4, color: colors.dim, fontSize: 13.5 },
  head: { flex: 1, color: colors.faint, fontSize: 11.5, fontWeight: '700', textAlign: 'right' },
  value: { flex: 1, color: colors.text, fontSize: 14.5, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  common: { marginTop: 4 },
  commonText: { color: colors.dim, fontSize: 13 },
  commonNum: { color: colors.text, fontWeight: '700' },
  joinCard: { marginHorizontal: space.lg, marginTop: 12, backgroundColor: colors.card, borderRadius: radius.card, padding: 14, gap: 6 },
  joinTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
  joinBody: { color: colors.dim, fontSize: 13.5, lineHeight: 19 },
});
