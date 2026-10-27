/**
 * Settings → Daily puzzle.
 *
 * THREE SWITCHES AND A TIME, on their own screen rather than in a list of
 * everything else, because they are one subject. The first is the master:
 * off, and the game is gone from the Explore tab, the profile and the
 * reminders — but NOT from `meta`. The history, the stats and the squares
 * stay, so switching it back on is not a fresh start.
 *
 * THE REMINDER IS OFF BY DEFAULT and fires at the chosen hour, and again at 22:00, only while
 * today's puzzle is unplayed (`puzzleRemindersFrom`). Turning it on asks for notification permission
 * through the same door as every other reminder: `notifications.ts` plans
 * nothing while its master switch is off, so the switch has to open that too.
 *
 * THE PUBLIC SWITCH takes effect at once: turning it off republishes the
 * arrangement without the puzzle's value, so the server does not keep a copy
 * the owner no longer wants shown.
 */
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text } from 'react-native';

import { MenuRow, NavHeader, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { setPuzzleReminder, syncEpisodeNotifications } from '@/notifications';
import { PUZZLE_LAST_CHANCE_HOUR } from '@/puzzle';
import {
  puzzleOn,
  puzzlePublicOn,
  puzzleReminderHour,
  puzzleReminderOn,
  republishPuzzleBlock,
  setPuzzleOn,
  setPuzzlePublicOn,
  setPuzzleReminderHour,
  setPuzzleStreakOnProfile,
  puzzleStreakOptedIn,
} from '@/puzzle-data';
import { colors, space } from '@/theme';

export default function PuzzleSettingsScreen() {
  const [on, setOn] = useState(puzzleOn);
  const [remind, setRemind] = useState(puzzleReminderOn);
  const [hour, setHour] = useState(puzzleReminderHour);
  const [pub, setPub] = useState(puzzlePublicOn);
  const [streak, setStreak] = useState(puzzleStreakOptedIn);

  const toggleRemind = (v: boolean) => {
    void setPuzzleReminder(v).then((ok) => {
      if (ok) setRemind(v);
      else Alert.alert(t('settings.app.notificationsOffTitle'), t('settings.app.notificationsOffBody'));
    });
  };

  return (
    <Screen>
      <NavHeader title={t('puzzle.settings.title')} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        <MenuRow
          trackId="puzzle.settings.game"
          title={t('puzzle.settings.game')}
          sub={t('puzzle.settings.gameSub')}
          right={
            <Switch
              value={on}
              onValueChange={(v) => {
                setOn(v);
                setPuzzleOn(v);
                // Off takes the block off the public profile and the reminder
                // out of the plan; on puts both back.
                void republishPuzzleBlock();
                void syncEpisodeNotifications(true);
              }}
              trackColor={{ true: colors.green }}
            />
          }
        />
        {on && (
          <>
            <MenuRow
              trackId="puzzle.settings.remind"
              title={t('puzzlePolish.remind')}
              sub={t('puzzleReminders.sub', { last: `${PUZZLE_LAST_CHANCE_HOUR}:00` })}
              right={<Switch value={remind} onValueChange={toggleRemind} trackColor={{ true: colors.green }} />}
            />
            {remind && (
              // Tapping CYCLES the hour, as the episode reminders' row does:
              // twenty-four answers, four anybody wants, no wheel.
              <MenuRow
                trackId="puzzle.settings.remindAt"
                title={t('puzzle.settings.remindAt')}
                onPress={() => {
                  const next = (hour + 1) % 24;
                  setHour(next);
                  setPuzzleReminderHour(next);
                  void syncEpisodeNotifications(true);
                }}
                right={<Text style={styles.hour}>{`${String(hour).padStart(2, '0')}:00`}</Text>}
              />
            )}
            {/* The intro's first switch, here so it can be undone. */}
            <MenuRow
              trackId="puzzle.settings.streak"
              title={t('puzzleIntro.streak')}
              sub={t('puzzleIntro.streakSub')}
              right={
                <Switch
                  value={streak}
                  onValueChange={(v) => {
                    setStreak(v);
                    setPuzzleStreakOnProfile(v);
                  }}
                  trackColor={{ true: colors.green }}
                />
              }
            />
            <MenuRow
              trackId="puzzle.settings.public"
              title={t('puzzlePolish.public')}
              sub={t('puzzlePolish.publicSub')}
              right={
                <Switch
                  value={pub}
                  onValueChange={(v) => {
                    setPub(v);
                    setPuzzlePublicOn(v);
                    void republishPuzzleBlock();
                  }}
                  trackColor={{ true: colors.green }}
                />
              }
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hour: { color: colors.blue, fontSize: 15.5, fontWeight: '700' },
});
