/**
 * Everything I watch (2.0.3): every show, anime and film in the library on one
 * page, reached from the profile block of the same name.
 *
 * It is the Shows page and the Films page joined, not a third design: the same
 * rows (`everything.ts`), the same poster with the same progress bar, the same
 * search box, and the same filter pill and sheet. What the sheet adds here is
 * a Type axis, because a mixed list is only useful if it can be unmixed again.
 *
 * OWN PROFILE ONLY. The server holds the shelves a profile publishes, capped,
 * and no full library by design — so somebody else's "everything" would be a
 * partial list wearing a name that promises the whole one.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/text';

import { Poster, posterSpeech } from '@/components/poster';
import { NavHeader, Screen, useScreenWidth } from '@/components/ui';
import { everythingFacts, everythingItems, type LibraryItem } from '@/everything';
import { everythingView } from '@/everything-view';
import { useFilters } from '@/filters-store';
import { t } from '@/i18n';
import { progressColorOf, progressOf } from '@/show-status';
import { activeFilterCount, gridGeometry, matchesFilters } from '@/pure';
import { colors, ls, radius, space } from '@/theme';

export default function EverythingScreen() {
  // In STATE and re-read on focus, as the Shows page does: a title removed on
  // its own page must be gone on the way back, and a render-time read would be
  // memoised away by the React Compiler (see CLAUDE.md).
  const [items, setItems] = useState<LibraryItem[]>(everythingItems);
  useFocusEffect(useCallback(() => setItems(everythingItems()), []));
  useFocusEffect(useCallback(() => () => Keyboard.dismiss(), []));

  /*
   * THE SAME FILTERS AS SHOWS AND MOVIES (27 Oct 2026). The page had its own
   * chips and a sort pill, which looked like neither of the pages it joins and
   * offered none of their filters. It now has their floating pill and their
   * sheet (`/everything-filters`, kind 'everything'), persisted under its own
   * key, with the old chips folded in as the sheet's Type axis and the same
   * Plus line for the extra axes.
   */
  const filters = useFilters('everything');
  const active = activeFilterCount(filters);
  const [query, setQuery] = useState('');

  // The expensive half (a metadata lookup per title) depends on the library
  // and the filters alone, so typing does not re-resolve it per keystroke.
  const kept = useMemo(() => {
    const facts = everythingFacts(items);
    return items.filter((_, i) => matchesFilters(facts[i], filters));
  }, [items, filters]);
  const shown = useMemo(() => everythingView(kept, filters.sort, query), [kept, filters.sort, query]);

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
      {/* The Shows page's own pill, in its place: see all-shows. */}
      <Pressable accessibilityRole="button" style={styles.filtersFab} onPress={() => router.push('/everything-filters')}>
        <Ionicons name="options-outline" size={16} color={colors.onYellow} />
        <Text style={styles.filtersText}>{t('allShows.filters')}</Text>
        {active > 0 ? <Text style={styles.filtersBadge}>{active}</Text> : null}
      </Pressable>
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
    marginBottom: 4,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, padding: 0 },
  empty: { color: colors.dim, fontSize: 14, textAlign: 'center', marginTop: 40 },
  filtersFab: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  filtersText: { color: colors.onYellow, fontSize: 13, fontWeight: '800', letterSpacing: ls(1), textTransform: 'uppercase' },
  filtersBadge: {
    color: colors.yellow,
    backgroundColor: colors.onYellow,
    fontSize: 11,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
    borderRadius: 9,
    paddingVertical: 1,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
});
