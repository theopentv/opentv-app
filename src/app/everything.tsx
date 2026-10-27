/**
 * Everything I watch (2.0.3): every show, anime and film in the library on one
 * page, reached from the profile block of the same name.
 *
 * It is the Shows page and the Films page joined, not a third design: the same
 * rows (`everything.ts`), the same poster with the same progress bar, the same
 * search box, and the same three orders. What it adds is the chips, because a
 * mixed list is only useful if it can be unmixed again in one tap.
 *
 * OWN PROFILE ONLY. The server holds the shelves a profile publishes, capped,
 * and no full library by design — so somebody else's "everything" would be a
 * partial list wearing a name that promises the whole one.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';

import { ActionSheet } from '@/components/action-sheet';
import { Poster, posterSpeech } from '@/components/poster';
import { NavHeader, Screen, useScreenWidth } from '@/components/ui';
import { everythingItems, type LibraryItem } from '@/everything';
import { everythingCounts, everythingView, type EverythingKind, type EverythingSort } from '@/everything-view';
import { formatCount } from '@/locale-resolve';
import { currentLocale, t } from '@/i18n';
import { progressColorOf, progressOf } from '@/show-status';
import { gridGeometry } from '@/pure';
import { colors, radius, space } from '@/theme';

const SORT_LABEL = {
  recent: 'filters.sortLastWatched',
  alpha: 'filters.sortAlpha',
  added: 'filters.sortLastAdded',
} as const;

export default function EverythingScreen() {
  // In STATE and re-read on focus, as the Shows page does: a title removed on
  // its own page must be gone on the way back, and a render-time read would be
  // memoised away by the React Compiler (see CLAUDE.md).
  const [items, setItems] = useState<LibraryItem[]>(everythingItems);
  useFocusEffect(useCallback(() => setItems(everythingItems()), []));
  useFocusEffect(useCallback(() => () => Keyboard.dismiss(), []));

  const [kind, setKind] = useState<EverythingKind>('all');
  const [sort, setSort] = useState<EverythingSort>('recent');
  const [query, setQuery] = useState('');
  const [sorting, setSorting] = useState(false);

  const counts = useMemo(() => everythingCounts(items), [items]);
  const shown = useMemo(() => everythingView(items, kind, sort, query), [items, kind, sort, query]);

  // The Anime chip exists only when TheTVDB has tagged at least one show so:
  // a chip that always answers "none" is a promise the data cannot keep.
  const chips: { key: EverythingKind; label: string; n: number }[] = [
    { key: 'all', label: t('everything.chipAll'), n: counts.shows + counts.movies },
    { key: 'shows', label: t('allShows.title'), n: counts.shows },
    ...(counts.anime > 0 ? [{ key: 'anime' as const, label: t('everything.chipAnime'), n: counts.anime }] : []),
    { key: 'movies', label: t('allMovies.title'), n: counts.movies },
  ];

  const cols = gridGeometry(useScreenWidth(), space.md, 3).cols;
  const q = query.trim();

  return (
    <Screen>
      <NavHeader title={t('everything.title')} />
      <View style={styles.searchRow}>
        <Ionicons name="search" size={17} color={colors.faint} />
        <TextInput
          accessibilityLabel={t('everything.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('everything.searchPlaceholder')}
          placeholderTextColor={colors.faint}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.clearSearch')} hitSlop={8} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={17} color={colors.faint} />
          </Pressable>
        )}
      </View>
      <View style={styles.chipBar}>
        {/* The chips scroll, the sort stays: in German or Polish four chips
            with their counts run past a phone's width, and the sort is the
            one control that must never be scrolled out of reach. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flex: 1 }}>
          {chips.map((c) => (
            <Pressable
              key={c.key}
              style={[styles.chip, kind === c.key && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === c.key }}
              onPress={() => setKind(c.key)}>
              <Text style={[styles.chipText, kind === c.key && styles.chipTextOn]}>
                {`${c.label} ${formatCount(c.n, currentLocale())}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          style={styles.sortBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${t('filters.sortByTitle')}: ${t(SORT_LABEL[sort])}`}
          onPress={() => setSorting(true)}>
          <Ionicons name="swap-vertical" size={16} color={colors.dim} />
          <Text style={styles.sortText} numberOfLines={1}>
            {t(SORT_LABEL[sort])}
          </Text>
        </Pressable>
      </View>
      <FlatList
        // FlatList cannot change numColumns in place
        key={cols}
        data={shown}
        keyExtractor={(it) => it.key}
        numColumns={cols}
        columnWrapperStyle={{ gap: 3 }}
        contentContainerStyle={{ padding: space.md, gap: 3, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={18}
        ListEmptyComponent={
          <Text style={styles.empty}>{q ? t('everything.noMatches', { query: q }) : t('everything.empty')}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={{ flex: 1 / cols }}
            onPress={() =>
              item.show
                ? router.push(`/show/${item.show.tvdbId}`)
                : router.push(`/movie/${encodeURIComponent(item.key.slice(2))}`)
            }
            accessibilityRole="button"
            accessibilityLabel={posterSpeech(item.name, item.show ? { progress: progressOf(item.show) } : undefined)}>
            <Poster
              name={item.name}
              uri={item.poster}
              progress={item.show ? progressOf(item.show) : undefined}
              progressColor={item.show ? progressColorOf(item.show) : undefined}
            />
          </Pressable>
        )}
      />
      <ActionSheet
        visible={sorting}
        title={t('filters.sortByTitle')}
        actions={(Object.keys(SORT_LABEL) as EverythingSort[]).map((k) => ({
          text: t(SORT_LABEL[k]),
          icon: k === 'alpha' ? 'text-outline' : k === 'added' ? 'add-circle-outline' : 'time-outline',
          selected: sort === k,
          onPress: () => {
            setSort(k);
            setSorting(false);
          },
        }))}
        onClose={() => setSorting(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: space.md,
    marginTop: 2,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },
  chipBar: { flexDirection: 'row', alignItems: 'center', paddingEnd: space.md },
  chipRow: { gap: 8, paddingHorizontal: space.md, paddingVertical: 10 },
  chip: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.yellow },
  chipText: { color: colors.dim, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.onYellow },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 },
  sortText: { color: colors.dim, fontSize: 13, fontWeight: '700' },
  empty: { color: colors.dim, fontSize: 14, textAlign: 'center', marginTop: 40 },
});
