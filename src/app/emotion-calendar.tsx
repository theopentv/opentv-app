/**
 * A year of how it felt.
 *
 * THE SAME GRID, A DIFFERENT QUESTION. The heatmap answers "how much did I
 * watch"; this answers "what was my year like". It is deliberately the same
 * component with a `colorOf` — a second calendar would be a second place for
 * the month arithmetic, the RTL mirroring and the cell sizing to be wrong.
 *
 * FREE, AND SEEN BY EVERYONE. Like Wrapped, this is built to LEAVE the app:
 * "February was all sad" is a sentence about somebody's own life, computed from
 * marks they made years ago inside an app that has since died. Charging to look
 * at your own feelings is charging for your own advertising. What Plus adds is
 * FILTERING the library by emotion — "everything that ever made me cry" — which
 * is new capability rather than a view of what is already yours.
 *
 * NOTHING LEAVES THE PHONE. Both tables are local, the join is local, and the
 * server has no column for either. That is not incidental: this is the clearest
 * example in the app of a feature no competitor can copy, because TV Time
 * collected these votes and took them down, and this app imported them.
 */

import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { monthOf, todayISO } from '@/components/heatmap';
import { NavHeader, Screen } from '@/components/ui';
import { emotionDayCounts, watchesOnDay } from '@/db';
import { watchDayCounts } from '@/stats-calc';
import { currentLocale, t } from '@/i18n';
import { dominantEmotion, emotionColor, EMOTION_NAMES, monthWeeks, shiftMonth } from '@/pure';
import { colors, onAccent, radius, space } from '@/theme';
import { intlTag } from '@/locale-resolve';

/** Six months, the same window the profile heatmap uses at full size. */
const MONTHS = 6;

const emotionLabel = (i: number) => t(`media.emotions.${EMOTION_NAMES[i] ?? 'shocked'}` as never);

export default function EmotionCalendarScreen() {
  const [today, setToday] = useState(todayISO);
  const [endMonth, setEndMonth] = useState(() => monthOf(todayISO()));
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  const [feelings, setFeelings] = useState<Map<string, Map<number, number>>>(() => new Map());
  const [day, setDay] = useState<string | null>(null);

  // READ ON FOCUS, never in render: this is a walk of watch dates, and the
  // React Compiler would keep the first answer for ever.
  useFocusEffect(
    useCallback(() => {
      setToday(todayISO());
      setCounts(watchDayCounts());
    }, []),
  );

  // The feelings are re-read per window rather than for the whole archive: six
  // months of squares does not need nine years of votes.
  useFocusEffect(
    useCallback(() => {
      const from = `${shiftMonth(endMonth, -(MONTHS - 1))}-01`;
      const to = `${shiftMonth(endMonth, 1)}-01`;
      setFeelings(emotionDayCounts(from, to));
    }, [endMonth]),
  );

  const colorOf = (d: string) => {
    const felt = feelings.get(d);
    if (!felt) return null;
    const top = dominantEmotion(felt);
    return top == null ? null : emotionColor(top);
  };

  /* Only the feelings actually present in this window. A fixed legend of twelve
     is mostly a list of things the reader did not feel, and it pushes the grid
     off the screen on a phone. */
  const present = [...new Set([...feelings.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);

  /*
   * READ IN THE TAP, not in render. `watchesOnDay(day)` in the body is a
   * database call the React Compiler memoises against its argument — correct
   * today, and quietly stale the moment anything on this screen can change what
   * a day contains. State React sets is the only invalidation that survives it.
   */
  const [items, setItems] = useState<ReturnType<typeof watchesOnDay>>([]);

  return (
    <Screen>
      <NavHeader title={t('emotionCalendar.title')} close />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.blurb}>{t('emotionCalendar.blurb')}</Text>

        {present.length > 0 && (
          <View style={s.legend}>
            {/* The days with no feeling picked, usually most of the grid: they
                keep the heatmap's yellow, which nothing else here explains. */}
            <View style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: colors.yellow }]} />
              <Text style={s.legendText}>{t('emotionCalendar.noFeeling')}</Text>
            </View>
            {present.map((i) => (
              <View key={i} style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: emotionColor(i) }]} />
                <Text style={s.legendText}>{emotionLabel(i)}</Text>
              </View>
            ))}
          </View>
        )}
        {/* UPRIGHT, month under month, at a phone's full width (Henrike, 31 Oct):
            the sideways heatmap's squares were too small to tap. Newest first. */}
        {Array.from({ length: MONTHS }, (_, n) => shiftMonth(endMonth, -n)).map((month) => (
          <View key={month} style={s.month}>
            <Text style={s.monthTitle} accessibilityRole="header">
              {new Date(`${month}-15T12:00:00`).toLocaleDateString(intlTag(currentLocale()), { month: 'long', year: 'numeric' })}
            </Text>
            <View style={s.week}>
              {/* 5 Oct 2026 was a Monday; any Monday-to-Sunday run would do. */}
              {[5, 6, 7, 8, 9, 10, 11].map((n) => (
                <Text key={n} style={s.weekday}>
                  {new Date(2026, 9, n).toLocaleDateString(intlTag(currentLocale()), { weekday: 'narrow' })}
                </Text>
              ))}
            </View>
            {monthWeeks(month).map((week, w) => (
              <View key={w} style={s.week}>
                {week.map((d, c) => {
                  if (d == null) return <View key={c} style={s.dayCell} />;
                  const bg = colorOf(d) ?? ((counts.get(d) ?? 0) > 0 ? colors.yellow : colors.card);
                  return (
                    <View key={d} style={s.dayCell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={d}
                        accessibilityState={{ selected: day === d }}
                        style={[s.dayFill, { backgroundColor: bg }, (d === today || day === d) && s.dayRing]}
                        onPress={() => {
                          const next = day === d ? null : d;
                          setDay(next);
                          setItems(next ? watchesOnDay(next) : []);
                        }}>
                        <Text style={[s.dayNum, { color: bg === colors.card ? colors.faint : onAccent(bg) }]}>{Number(d.slice(8))}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
            {/* Under its own month: at the end of the page it would open six months
                below the finger. */}
            {day != null && monthOf(day) === month && (
              <View style={s.daySheet}>
                <Text style={s.dayTitle}>
                  {new Date(`${day}T12:00:00`).toLocaleDateString(intlTag(currentLocale()), {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                {items.length === 0 ? (
                  <Text style={s.dayEmpty}>{t('emotionCalendar.nothing')}</Text>
                ) : (
                  <FlatList
                    data={items}
                    scrollEnabled={false}
                    keyExtractor={(x, i) => `${x.showId}-${x.season}-${x.episode}-${i}`}
                    renderItem={({ item }) => (
                      <Pressable accessibilityRole="button"
                        style={s.row}
                        onPress={() => router.push(`/episode/${item.showId}-s${item.season}e${item.episode}`)}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowShow} numberOfLines={1}>
                            {item.show}
                          </Text>
                          <Text style={s.rowCode}>
                            S{item.season}E{item.episode}
                          </Text>
                        </View>
                        <View style={s.rowFeelings}>
                          {item.emotions.map((e) => (
                            <View key={e} style={[s.chip, { borderColor: emotionColor(e) }]}>
                              <Text style={[s.chipText, { color: emotionColor(e) }]}>{emotionLabel(e)}</Text>
                            </View>
                          ))}
                        </View>
                      </Pressable>
                    )}
                  />
                )}
              </View>
            )}
          </View>
        ))}
        <View style={s.pager}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEndMonth(shiftMonth(endMonth, -MONTHS))}>
            <Text style={s.pagerText}>{t('emotionCalendar.earlier')}</Text>
          </Pressable>
          {endMonth < monthOf(today) && (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEndMonth(monthOf(today))}>
              <Text style={s.pagerText}>{t('emotionCalendar.latest')}</Text>
            </Pressable>
          )}
        </View>


      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  month: { paddingHorizontal: space.lg, paddingBottom: 18, gap: 4 },
  monthTitle: { color: colors.text, fontSize: 16, fontWeight: '800', paddingBottom: 4 },
  week: { flexDirection: 'row', gap: 4 },
  // The square sits INSIDE the flex cell: aspectRatio on the cell itself let a
  // row with empty cells size differently from a full one.
  dayCell: { flex: 1 },
  // The border is always there, clear: added only on today it widened that square and squeezed its row.
  dayFill: { width: '100%', aspectRatio: 1, borderRadius: 6, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayRing: { borderColor: colors.text },
  weekday: { flex: 1, color: colors.faint, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  dayNum: { fontSize: 12, fontWeight: '700' },
  pager: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg },
  pagerText: { color: colors.blue, fontSize: 14, fontWeight: '600' },
  blurb: { color: colors.dim, fontSize: 14, lineHeight: 20, paddingHorizontal: space.lg, paddingBottom: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: space.lg, paddingBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.dim, fontSize: 12, fontWeight: '600' },
  daySheet: { marginTop: 14, backgroundColor: colors.card, borderRadius: radius.card, padding: 14 },
  dayTitle: { color: colors.text, fontSize: 15, fontWeight: '800', paddingBottom: 8 },
  dayEmpty: { color: colors.faint, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowShow: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowCode: { color: colors.faint, fontSize: 12, fontWeight: '600', paddingTop: 2 },
  rowFeelings: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, maxWidth: '55%', justifyContent: 'flex-end' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
