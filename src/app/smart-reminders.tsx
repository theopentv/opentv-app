/**
 * Smart reminders (2.0.0, PLUS) — when an episode reminder arrives, not
 * whether. One screen for the global set and, with `?show=<tvdbId>`, for one
 * show, which then either follows the global set or has its own.
 *
 * THE PLAIN REMINDER STAYS FREE AND UNCHANGED. Everything here only changes
 * reminders the master switch already sends; the rules are `smartFireTime` and
 * friends in `notification-plan.ts`, tested.
 *
 * Reached only through `requirePlus`, so a free user lands on the paywall
 * instead; a lapsed subscriber who still has this open sees the row that says
 * why nothing here applies any more, like the calendar does.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text } from 'react-native';

import { MenuRow, NavHeader, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { DEFAULT_SMART_PREFS, REMINDER_DELAYS, type ReminderDelay, type SmartPrefs } from '@/notification-plan';
import { setSmartPrefs, smartPrefs, smartShowPrefs } from '@/notifications';
import { usePlus } from '@/plus';
import { colors, space } from '@/theme';

const DELAY_KEY: Record<ReminderDelay, 'smartReminders.delayUsual' | 'smartReminders.delayOnAir' | 'smartReminders.delayHour' | 'smartReminders.delayThreeHours' | 'smartReminders.delayNextMorning'> = {
  usual: 'smartReminders.delayUsual',
  onAir: 'smartReminders.delayOnAir',
  hour: 'smartReminders.delayHour',
  threeHours: 'smartReminders.delayThreeHours',
  nextMorning: 'smartReminders.delayNextMorning',
};

export default function SmartRemindersScreen() {
  const plus = usePlus();
  const { show, name } = useLocalSearchParams<{ show?: string; name?: string }>();
  const tvdbId = show ? Number(show) || null : null;
  // Per show: null = follow the global set. The global set itself is never null on screen.
  const [own, setOwn] = useState<SmartPrefs | null>(() => (tvdbId ? smartShowPrefs(tvdbId) : (smartPrefs() ?? DEFAULT_SMART_PREFS)));
  const shown = own ?? smartPrefs() ?? DEFAULT_SMART_PREFS;

  const save = (next: SmartPrefs | null) => {
    setOwn(next);
    void setSmartPrefs(tvdbId, next);
  };
  const change = (patch: Partial<SmartPrefs>) => save({ ...shown, ...patch });
  // A show following the global set shows those values, greyed into read-only.
  const editable = tvdbId == null || own != null;

  return (
    <Screen>
      <NavHeader title={tvdbId ? (name ?? t('smartReminders.title')) : t('smartReminders.title')} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
        {!plus && (
          <MenuRow trackId="smartReminders.lapsed" title={t('smartReminders.lapsedTitle')} sub={t('smartReminders.lapsedBody')} onPress={() => router.push('/paywall')} />
        )}
        <Text style={styles.intro}>{t('smartReminders.intro')}</Text>
        {tvdbId != null && (
          <MenuRow
            trackId="smartReminders.followGlobal"
            title={t('smartReminders.followGlobal')}
            sub={t('smartReminders.followGlobalSub')}
            right={<Switch value={own == null} onValueChange={(v) => save(v ? null : shown)} trackColor={{ true: colors.green }} />}
          />
        )}
        {/* CYCLES, like the reminder hour on the screen before: five answers,
            and a picker for five is a screen nobody needs. */}
        <MenuRow
          trackId="smartReminders.delay"
          title={t('smartReminders.delay')}
          sub={t('smartReminders.delaySub')}
          onPress={editable ? () => change({ delay: REMINDER_DELAYS[(REMINDER_DELAYS.indexOf(shown.delay) + 1) % REMINDER_DELAYS.length]! }) : undefined}
          right={<Text style={[styles.value, !editable && styles.off]}>{t(DELAY_KEY[shown.delay])}</Text>}
        />
        <MenuRow
          trackId="smartReminders.weekends"
          title={t('smartReminders.weekends')}
          sub={t('smartReminders.weekendsSub')}
          right={<Switch disabled={!editable} value={shown.weekendsOnly} onValueChange={(v) => change({ weekendsOnly: v })} trackColor={{ true: colors.green }} />}
        />
        <MenuRow
          trackId="smartReminders.wholeSeason"
          title={t('smartReminders.wholeSeason')}
          sub={t('smartReminders.wholeSeasonSub')}
          right={<Switch disabled={!editable} value={shown.wholeSeason} onValueChange={(v) => change({ wholeSeason: v })} trackColor={{ true: colors.green }} />}
        />
        <Text style={styles.note}>{t('smartReminders.quietNote')}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.dim, fontSize: 13.5, lineHeight: 19, paddingHorizontal: space.lg, paddingVertical: space.md },
  note: { color: colors.faint, fontSize: 12.5, lineHeight: 17, paddingHorizontal: space.lg, paddingTop: space.md },
  value: { color: colors.blue, fontSize: 15.5, fontWeight: '700' },
  off: { color: colors.faint },
});
