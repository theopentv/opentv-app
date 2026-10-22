/**
 * The puzzle archive — every past day, newest first, with how it went.
 *
 * THE NEW YORK TIMES' SHAPE (14 Oct): today's puzzle is free and always will
 * be; playing a day you missed is Plus. Everybody sees the whole list and
 * their own squares on it — the list is what makes the offer make sense —
 * and a tap on an unplayed day is where the paywall comes in (`requirePlus`).
 *
 * FROM THE FIRST DAY PLAYED, not the epoch, when that is later
 * (`archiveDays`): the archive is a record of this person's puzzles, and a
 * year of empty days before they ever opened the game is a wall.
 *
 * A PLAYED DAY IS NOT REPLAYED. Its result is final, live or from the
 * archive — the answer is already known, and a second go would only be a
 * second, easier game. Since 22 Oct its row opens that day's RESULT,
 * read-only and shareable (`/puzzle?view=`), free: it is the player's own
 * finished game. Today's row opens the puzzle screen, which shows it.
 *
 * READ ON FOCUS, so a day played from here is coloured when you come back.
 *
 * AND YOUR HISTORY (22 Oct). Above the list, the all-time numbers — played,
 * win %, average tries, the longest puzzle streak, the first day played —
 * and today's result on top once it is in. Every played row names the title
 * it was: the player's own past answer, no secret once played, and never
 * sent anywhere (`puzzleTitles` reads the library on this phone). The last
 * `FREE_HISTORY_DAYS` are everybody's; an older title is Plus, and tapping
 * its row is where the paywall comes in, exactly as replaying does.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatsRow, levelColor, puzzleDay } from '@/components/puzzle-block';
import { NavHeader, Screen } from '@/components/ui';
import { currentLocale, t } from '@/i18n';
import { requirePlus, usePlus } from '@/plus';
import { MAX_TRIES, archiveDays, historyUnlocked, longestStreak, puzzleNumber, puzzleStats, winLevel, type PuzzleId, type Result, type Stats } from '@/puzzle';
import { loadHistory, puzzleTitles, resultsByDay, today } from '@/puzzle-data';
import { colors, radius, space } from '@/theme';
import { intlTag } from '@/locale-resolve';

type Row = { d: string; n: number; r: Result | null };
type Summary = { stats: Stats; longest: number; first: string | null };

const longDay = (d: string): string =>
  new Date(`${d}T12:00:00`).toLocaleDateString(intlTag(currentLocale()), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function PuzzleArchiveScreen() {
  const plus = usePlus();
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Map<PuzzleId, string>>(new Map());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [day, setDay] = useState(today);

  useFocusEffect(
    useCallback(() => {
      const now = today();
      const history = loadHistory();
      const results = resultsByDay();
      const first = history[0]?.d ?? null;
      const past = archiveDays(now, first).map((d) => ({ d, n: puzzleNumber(d), r: results.get(d) ?? null }));
      const done = results.get(now);
      const list = done ? [{ d: now, n: puzzleNumber(now), r: done }, ...past] : past;
      setDay(now);
      setRows(list);
      setNames(puzzleTitles(list.flatMap((row) => (row.r ? [row.r.id] : []))));
      setSummary(history.length ? { stats: puzzleStats(history), longest: longestStreak(history), first } : null);
    }, []),
  );

  const status = (r: Result | null): string =>
    r == null
      ? t('puzzlePolish.notPlayed')
      : r.won
        ? t('puzzlePolish.solvedIn', { score: `${r.tries}/${MAX_TRIES}` })
        : t('puzzlePolish.missed');

  const open = (d: string) => {
    if (!requirePlus('puzzle.archive')) return;
    router.push(`/puzzle?day=${d}`);
  };

  const header = (
    <>
      {summary && (
        <View style={s.history}>
          <Text style={s.heading}>{t('puzzleHistory.title')}</Text>
          <StatsRow stats={summary.stats} big />
          {summary.longest > 0 && <Text style={s.line}>{t('puzzleHistory.longest', { count: summary.longest })}</Text>}
          {summary.first && <Text style={s.line}>{t('puzzleHistory.firstDay', { date: puzzleDay(summary.first) })}</Text>}
          {!plus && <Text style={s.lockLine}>{t('puzzleHistory.locked')}</Text>}
        </View>
      )}
      <Text style={s.sub}>{t('puzzlePolish.archiveSub')}</Text>
    </>
  );

  return (
    <Screen>
      <NavHeader title={t('puzzlePolish.archiveTitle')} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.d}
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={s.empty}>{t('puzzlePolish.archiveEmpty')}</Text>}
        renderItem={({ item }) => {
          const played = item.r != null;
          const unlocked = historyUnlocked(item.d, day, plus);
          // A played day opens its result — unless its title is still behind Plus.
          const locked = played && !unlocked;
          const name = played && unlocked ? names.get(item.r!.id) : undefined;
          const line = name ? `${name} · ${status(item.r)}` : status(item.r);
          return (
            <Pressable
              style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.lift }]}
              onPress={() =>
                locked
                  ? requirePlus('puzzle.history')
                  : !played
                    ? open(item.d)
                    : router.push(item.d === day ? '/puzzle' : `/puzzle?view=${item.d}`)
              }
              accessibilityRole="button"
              accessibilityLabel={`#${item.n}, ${longDay(item.d)}, ${line}`}
              accessibilityHint={(!played || locked) && !plus ? t('puzzlePolish.needsPlus') : undefined}>
              <View style={[s.square, item.r ? { backgroundColor: levelColor(winLevel(item.r)) } : s.squareEmpty]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title} numberOfLines={1}>
                  #{item.n} <Text style={s.date}>· {longDay(item.d)}</Text>
                </Text>
                <Text style={s.status} numberOfLines={1}>
                  {line}
                </Text>
              </View>
              {(played && !locked) || plus ? (
                <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.faint} />
              ) : (
                <View style={s.plus}>
                  <Ionicons name="lock-closed" size={11} color={colors.onYellow} />
                  <Text style={s.plusText}>{t('plus.badge')}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  history: { paddingHorizontal: space.lg, paddingBottom: 18, gap: 8 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  line: { color: colors.dim, fontSize: 13.5, textAlign: 'center' },
  lockLine: { color: colors.faint, fontSize: 12.5, textAlign: 'center' },
  sub: { color: colors.dim, fontSize: 13.5, lineHeight: 19, paddingHorizontal: space.lg, paddingBottom: 12 },
  empty: { color: colors.dim, fontSize: 15, textAlign: 'center', padding: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  square: { width: 26, height: 26, borderRadius: 7 },
  squareEmpty: { borderWidth: 1.5, borderColor: colors.liftStrong },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  date: { color: colors.dim, fontWeight: '600' },
  status: { color: colors.dim, fontSize: 13 },
  plus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  plusText: { color: colors.onYellow, fontSize: 10, fontWeight: '900' },
});
