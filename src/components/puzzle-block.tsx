/**
 * The profile block: this month as a calendar of squares, and the three stats.
 *
 * REDRAWN 14 Oct. The first version was the watch heatmap in green with a
 * streak under it — pale greens that read as "a bit", a grey loss that read
 * as "not played", and a second streak beside the profile's watching one.
 * Now every square says one thing at a glance:
 *
 *   green  — solved early; it shades towards amber the later the solve,
 *   red    — missed,
 *   yellow — missed, but a guess was the right series (14 Oct),
 *   empty  — not played (a hollow cell, so it is visibly NOT a result).
 *
 * Under it — or beside it, in a wide block — Played, Win %, Average tries:
 * the numbers Wordle taught everybody to read.
 *
 * One number per day is the whole input (`winLevel`), so the block on a
 * visitor's phone is drawn from the same value the owner's phone published —
 * counts and colours, never a title.
 *
 * SIZED BY MEASURING, not by the grid's arithmetic: the block may be 1x1,
 * 2x1 or 2x2, and a month is five or six rows of seven either way, so the
 * cells are whatever fits the box they were given. Weeks run in the reading
 * direction, so in Arabic Sunday is on the right, as a calendar there is.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/text';

import { todayISO } from '@/components/heatmap';
import { CLOSE_SQUARE } from '@/components/puzzle-share-card';
import { currentLocale, fmtDecimal, t } from '@/i18n';
import { intlTag } from '@/locale-resolve';
import type { WidgetSpan } from '@/profile-layout';
import { MAX_TRIES, type PublicPuzzle, type Stats } from '@/puzzle';
import { calendarMonth, mixHex } from '@/pure';
import { ACCENTS, colors, ls } from '@/theme';

const GAP = 3;

/**
 * A day's colour from its level: 6 (first try) is the full green, 1 (sixth
 * try) is amber — the accent set's orange, which is the warm end of the same
 * scale — 0 is the danger red, and a day not played has no fill at all.
 */
export function levelColor(level: number): string {
  // A loss that found the right series (`CLOSE_LEVEL`): the 🟨 of its grid.
  if (level < 0) return CLOSE_SQUARE;
  if (level <= 0) return colors.danger;
  return mixHex(colors.green, ACCENTS.orange, (MAX_TRIES - Math.min(level, MAX_TRIES)) / (MAX_TRIES - 1));
}

/** "18 Oct" in the reader's language (Western digits in Arabic, via
 *  `intlTag`), with the year only when it is not this one. */
export function puzzleDay(d: string): string {
  const sameYear = d.slice(0, 4) === String(new Date().getFullYear());
  return new Date(`${d}T12:00:00`).toLocaleDateString(intlTag(currentLocale()), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "3.4", or a dash before the first win — never "0" tries. */
export const avgText = (st: Stats): string => (st.avg == null ? '–' : fmtDecimal(st.avg));

/** The three numbers in one row. `big` on the game screen, small in the block. */
export function StatsRow({ stats, big = false }: { stats: Stats; big?: boolean }) {
  const items: [string, string][] = [
    [String(stats.played), t('puzzlePolish.played')],
    [`${stats.win}%`, t('puzzlePolish.win')],
    [avgText(stats), t('puzzlePolish.avg')],
  ];
  return (
    <View
      style={s.stats}
      accessible
      accessibilityLabel={t('puzzlePolish.statsA11y', { played: stats.played, win: stats.win, avg: avgText(stats) })}>
      {items.map(([v, label]) => (
        <View key={label} style={s.stat}>
          <Text style={[s.value, big && s.valueBig]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {v}
          </Text>
          <Text style={[s.label, big && s.labelBig]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * `streak` is the OWNER's alone (22 Oct, opt-in): drawn on their own phone
 * from `meta`, never from a published value — `publicPuzzle` has none.
 */
export function PuzzleBlock({
  value,
  span,
  streak = 0,
  since = null,
  hoursLeft = null,
}: {
  value: PublicPuzzle;
  span: WidgetSpan;
  streak?: number;
  /** The owner's alone, like `streak`: the day it started and the longest ever. */
  since?: { date: string; best: number } | null;
  /** The owner's alone: hours to midnight while today is unplayed. */
  hoursLeft?: number | null;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const today = todayISO();
  const weeks = calendarMonth(today.slice(0, 7));
  const levels = new Map(value.days);
  const played = value.days.length;
  // Wide and one row tall: the calendar on one side, the stats on the other.
  // Anything else is tall enough to stack them.
  const side = span === '2x1';
  // A 1x1 block has room for the calendar and the numbers, not for sentences.
  const extras = span !== '1x1' && (since != null || hoursLeft != null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.w || height !== box.h) setBox({ w: width, h: height });
  };
  const rows = Math.max(weeks.length, 1);
  // A content-height box (`hug`) reports no height: then the width decides.
  const byWidth = (box.w - 6 * GAP) / 7;
  const byHeight = (box.h - (rows - 1) * GAP) / rows;
  const cell = Math.max(4, Math.floor(box.h > 0 ? Math.min(byWidth, byHeight) : byWidth));
  const radius = Math.max(2, Math.round(cell / 4));

  const calendar = (
    <View
      style={side ? s.calSide : s.calStack}
      onLayout={onLayout}
      accessible
      accessibilityLabel={t('puzzle.blockPlayed', { count: played })}>
      {box.w > 0 && (
        <View style={{ gap: GAP, alignSelf: side ? 'flex-start' : 'center' }}>
          {weeks.map((week, wi) => (
            <View key={wi} style={{ flexDirection: 'row', gap: GAP }}>
              {week.map((day, di) => {
                // Outside the month: nothing, so the grid starts on a 1st.
                if (day == null) return <View key={di} style={{ width: cell, height: cell }} />;
                // Still to come: the faintest outline. Leaving them out drew a
                // month that stopped halfway down the block and read as
                // missing rather than as "the rest of October".
                if (day > today) return <View key={day} style={[{ width: cell, height: cell, borderRadius: radius }, s.future]} />;
                const level = levels.get(day);
                return (
                  <View
                    key={day}
                    style={[
                      { width: cell, height: cell, borderRadius: radius },
                      level == null ? s.empty : { backgroundColor: levelColor(level) },
                      day === today && s.today,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={[{ flex: 1, gap: 10 }, side && { flexDirection: 'row', alignItems: 'stretch' }]}>
      {calendar}
      {value.stats || streak > 0 || extras ? (
        <View style={[side ? s.statsSide : null, { gap: 6 }]}>
          {value.stats ? <StatsRow stats={value.stats} /> : null}
          {streak > 0 ? (
            <Text style={s.streak} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('puzzleStreak.days', { count: streak })}
            </Text>
          ) : null}
          {extras && since ? (
            <Text style={s.extra} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('puzzleHistory.blockSince', { date: puzzleDay(since.date), best: since.best })}
            </Text>
          ) : null}
          {extras && hoursLeft != null ? (
            <Text style={s.extra} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('puzzleHistory.hoursLeft', { count: hoursLeft })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  calStack: { flex: 1, minHeight: 0, justifyContent: 'center' },
  calSide: { flex: 1, minWidth: 0, justifyContent: 'center' },
  statsSide: { flex: 1, justifyContent: 'center' },
  /* A hollow cell: an edge in both themes (`liftStrong` darkens on paper and
     lightens on black), so "not played" can never be mistaken for a colour. */
  empty: { borderWidth: 1, borderColor: colors.liftStrong },
  future: { borderWidth: 1, borderColor: colors.lift },
  today: { borderWidth: 1.5, borderColor: colors.text },
  stats: { flexDirection: 'row', gap: 6 },
  streak: { color: colors.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  extra: { color: colors.dim, fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 1, minWidth: 0 },
  value: { color: colors.text, fontSize: 17, fontWeight: '900', letterSpacing: ls(-0.3) },
  valueBig: { fontSize: 26 },
  label: { color: colors.faint, fontSize: 9, fontWeight: '800', letterSpacing: ls(0.6), textTransform: 'uppercase' },
  labelBig: { fontSize: 10.5 },
});
