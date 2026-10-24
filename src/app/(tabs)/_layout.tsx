import Ionicons from '@expo/vector-icons/Ionicons';
// TV Time's own two: a set with an antenna, and a clapperboard.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect } from 'react';

import { runAfterInteractions } from '@/after-interactions';
import { offerBackupIfDue } from '@/backup-prompt';
import { offerCommunityIfDue } from '@/community-prompt';
import { tapSelection } from '@/haptics';
import { isNotifyScreenOwed } from '@/session-store';
import { t, useLocale } from '@/i18n';
import { colors } from '@/theme';
import { WhatsNew } from '@/whats-new';

export default function TabsLayout() {
  // THE TAB LABELS STAYED IN THE OLD LANGUAGE (15 Oct): this layout never
  // unmounts, nothing re-rendered it after a switch, and the compiler had
  // cached its t() calls besides. It listens for the change and is not memoised.
  'use no memo';
  const locale = useLocale();
  // The community offer for everyone who imported before this update existed
  // — and, one screen later, for the user who has just finished an import
  // through the notification opt-in. `offerCommunityIfDue` stamps its own flag
  // as it presents, so this fires at most once ever, whichever path reaches it
  // first.
  //
  // Deferred behind runAfterInteractions for the same reason the root layout
  // defers startup repairs: navigating while the tab navigator is still
  // mounting drops the push entirely.
  useEffect(() => {
    const task = runAfterInteractions(() => {
      // Not while the notification screen is still owed: it is drawn on top of
      // these tabs, so the push lands behind it and its `replace` discards it —
      // having already stamped the flag. `notify-optin` makes the offer itself
      // once it is answered.
      if (isNotifyScreenOwed()) return;
      // One ask per arrival: the backup question waits for the next open
      // when the community offer has just taken the screen.
      if (!offerCommunityIfDue()) void offerBackupIfDue();
    });
    return () => task.cancel();
  }, []);

  /*
   * NATIVE TABS since 2.0.1. A JS tab bar stays a row at the bottom of the
   * iPhone Duo's outer screen; a native one is what iOS moves into the strip
   * beside the clock. The native bar also counts and names its own tabs to
   * VoiceOver in the reader's language, which the old bar had to be told
   * (the hidden `index` route is not a tab at all here). TV Time's own icons
   * stay, drawn through VectorIcon.
   */
  return (
    <>
    <WhatsNew />
    <NativeTabs
      // Every tab remounts on a language switch, as `remountOnLocale` does for the
      // stack: NativeTabs has no screenLayout, so the whole bar is keyed instead.
      key={locale}
      tintColor={colors.text}
      iconColor={{ default: colors.faint, selected: colors.text }}
      labelStyle={{ default: { color: colors.faint }, selected: { color: colors.text } }}
      backgroundColor={colors.bg}
      // The bottom bar is a row of tabs like any other, and ticks like them
      // (14 Oct): every tab row in the app goes through `tapSelection`.
      screenListeners={{ tabPress: () => tapSelection() }}>
      {/* "/" only redirects to the opening tab — never shown as a tab */}
      <NativeTabs.Trigger name="index" hidden />
      <NativeTabs.Trigger name="shows">
        <NativeTabs.Trigger.Icon src={<VectorIcon family={MaterialCommunityIcons} name="television-classic" />} />
        <NativeTabs.Trigger.Label>{t('tabBar.shows')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="movies">
        <NativeTabs.Trigger.Icon src={<VectorIcon family={MaterialCommunityIcons} name="movie-open-outline" />} />
        <NativeTabs.Trigger.Label>{t('tabBar.movies')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Icon src={<VectorIcon family={Ionicons} name="search" />} />
        <NativeTabs.Trigger.Label>{t('tabBar.explore')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon src={<VectorIcon family={Ionicons} name="person-outline" />} />
        <NativeTabs.Trigger.Label>{t('tabBar.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
    </>
  );
}
