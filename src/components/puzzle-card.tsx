/**
 * The door to today's puzzle, on the Explore tab.
 *
 * ONE CARD, ONE TAP. It says which puzzle today is, where it stands (not
 * started, try three of six, solved in three, not today) — and nothing about
 * the show, which is the one thing a card on a tab anybody can
 * glance at must not give away.
 *
 * A FEW `meta` READS AND NOTHING ELSE. The Explore tab is opened constantly;
 * the answer pool (every show's cached metadata) is the game screen's cost,
 * not this card's. Once today's game is over the card also shows Played /
 * Win % / Avg. tries — the game screen's `StatsRow`, not a copy of it.
 *
 * TODAY'S PICTURE IN THE ICON'S PLACE (22 Oct), same 46pt square: the frame
 * the game pinned, at the game's first blur until today is played, then
 * sharp with the title beside the result (`todaysArt`). No picture pinned —
 * the game not opened yet today — and it is the 🎬 as before.
 *
 * READ ON FOCUS, NOT IN RENDER, for the reason `memory-card.tsx` gives: the
 * React Compiler memoises a render-time read, and this card is the one that
 * has to change the moment somebody comes back from playing.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatsRow } from '@/components/puzzle-block';
import { Squares } from '@/components/puzzle-share-card';
import { t } from '@/i18n';
import { MAX_TRIES, isOver, puzzleNumber, type Game, type PuzzleArt, type Stats } from '@/puzzle';
import { currentStats, loadGame, puzzleEntryRoute, puzzleOn, today, todaysArt } from '@/puzzle-data';
import { colors, radius, space } from '@/theme';

type Seen = { on: boolean; number: number; game: Game | null; stats: Stats | null; art: PuzzleArt | null };

export function PuzzleCard() {
  const [seen, setSeen] = useState<Seen | null>(null);

  useFocusEffect(
    useCallback(() => {
      const day = today();
      const game = loadGame(day);
      setSeen({
        on: puzzleOn(),
        number: puzzleNumber(day),
        game,
        // Only after today's game: before it, the numbers are yesterday's news.
        stats: game != null && isOver(game) ? currentStats() : null,
        art: todaysArt(day),
      });
    }, []),
  );

  if (!seen?.on) return null;
  const { game, number, stats, art } = seen;

  const sub =
    game == null || game.guesses.length === 0
      ? t('puzzle.cardSub')
      : !isOver(game)
        ? t('puzzle.cardProgress', { n: game.guesses.length + 1, max: MAX_TRIES })
        : game.won
          ? t('puzzle.cardWon', { score: `${game.guesses.length}/${MAX_TRIES}` })
          : t('puzzle.cardLost');
  // `art.title` is null until today is played, so this never names it early.
  const line = art?.title ? `${sub} · ${art.title}` : sub;

  return (
    <Pressable
      style={s.card}
      onPress={() => router.push(puzzleEntryRoute())}
      accessibilityRole="button"
      accessibilityLabel={`${t('puzzle.title')} #${number}. ${line}`}>
      <View style={s.icon}>
        {art ? (
          <Image source={{ uri: art.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" blurRadius={art.blur} />
        ) : (
          <Text style={{ fontSize: 24 }}>🎬</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.title} numberOfLines={1}>
          {t('puzzle.title')} <Text style={s.number}>#{number}</Text>
        </Text>
        <Text style={s.sub} numberOfLines={2}>
          {line}
        </Text>
        {game != null && game.guesses.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Squares game={game} size={14} gap={4} />
          </View>
        )}
        {stats != null && (
          <View style={{ marginTop: 8 }}>
            <StatsRow stats={stats} />
          </View>
        )}
      </View>
      <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.faint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: space.lg,
    marginBottom: 14,
    padding: 13,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.raise,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  title: { color: colors.text, fontSize: 16.5, fontWeight: '800' },
  number: { color: colors.yellow },
  sub: { color: colors.dim, fontSize: 13 },
});
