/**
 * The daily puzzle's first open (22 Oct) — what it is, and two free opt-ins.
 *
 * REPLACES THE FIRST-OPEN ALERT. A system alert over a game nobody had seen
 * yet asked about a reminder for something unexplained. This says what the
 * game is first, then asks both questions on one page, switches ON, because
 * the person has just tapped to play: the streak on their own profile, and a
 * reminder (which asks for notification permission through the same door as
 * every other reminder, `setPuzzleReminder`).
 *
 * SHOWN ONCE: "Start playing" stamps `remindOffered` whatever the switches
 * say, and every entry point routes by `puzzleEntryRoute`, so later taps go
 * straight to the game. Leaving with the back button stamps nothing — that
 * is not an answer.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { ContentColumn, MenuRow, NavHeader, Screen } from '@/components/ui';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { setPuzzleReminder } from '@/notifications';
import { markPuzzleReminderOffered, setPuzzleStreakOnProfile } from '@/puzzle-data';
import { colors, ls, radius, space } from '@/theme';

const HOW = [
  { icon: '🎬', key: 'puzzleIntro.howOne' as const },
  { icon: '6️⃣', key: 'puzzleIntro.howTries' as const },
  { icon: '🙈', key: 'puzzleIntro.howSafe' as const },
] as const;

export default function PuzzleIntroScreen() {
  const insets = useSafeAreaInsets();
  const [streak, setStreak] = useState(true);
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    tapLight();
    setPuzzleStreakOnProfile(streak);
    markPuzzleReminderOffered();
    const ok = remind ? await setPuzzleReminder(true).catch(() => false) : true;
    router.replace('/puzzle');
    if (!ok) Alert.alert(t('settings.app.notificationsOffTitle'), t('settings.app.notificationsOffBody'));
  };

  return (
    <Screen>
      <NavHeader title={t('puzzle.settings.title')} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <ContentColumn style={{ flex: 1, paddingHorizontal: space.xl }}>
          <View style={styles.body}>
            <Text style={styles.emoji}>🧩</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {t('puzzle.title')}
            </Text>
            <View style={styles.how}>
              {HOW.map((h) => (
                <View key={h.key} style={styles.howRow}>
                  <Text style={styles.howIcon}>{h.icon}</Text>
                  <Text style={styles.howText}>{t(h.key)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.opts}>
            <MenuRow
              trackId="puzzle.intro.streak"
              title={t('puzzleIntro.streak')}
              sub={t('puzzleIntro.streakSub')}
              right={<Switch value={streak} onValueChange={setStreak} trackColor={{ true: colors.green }} />}
            />
            <MenuRow
              trackId="puzzle.intro.remind"
              title={t('puzzleIntro.remind')}
              sub={t('puzzlePolish.remindSub')}
              right={<Switch value={remind} onValueChange={setRemind} trackColor={{ true: colors.green }} />}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            style={[styles.cta, { marginBottom: space.lg + insets.bottom }]}
            onPress={() => void start()}
            disabled={busy}>
            <Text style={styles.ctaText}>{t('puzzleIntro.start')}</Text>
          </Pressable>
        </ContentColumn>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 14, paddingVertical: space.lg },
  emoji: { fontSize: 46, textAlign: 'center' },
  title: { color: colors.text, fontSize: 27, fontWeight: '800', textAlign: 'center' },
  how: { gap: 14, marginTop: 10 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howIcon: { fontSize: 21, width: 30, textAlign: 'center' },
  howText: { color: colors.text, fontSize: 15.5, flex: 1, lineHeight: 21 },
  opts: { backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden', marginBottom: space.lg },
  cta: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: colors.onYellow, fontWeight: '800', fontSize: 15, letterSpacing: ls(0.5) },
});
