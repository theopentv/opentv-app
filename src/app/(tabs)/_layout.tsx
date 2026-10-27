import Ionicons from '@expo/vector-icons/Ionicons';
// TV Time's own two: a set with an antenna, and a clapperboard.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs, VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runAfterInteractions } from '@/after-interactions';
import { offerBackupIfDue } from '@/backup-prompt';
import { classicTabBarOn } from '@/classic-tab-bar';
import { offerCommunityIfDue } from '@/community-prompt';
import { getMeta } from '@/db';
import { tapSelection } from '@/haptics';
import { isNotifyScreenOwed } from '@/session-store';
import { remountOnLocale, t, useLocale } from '@/i18n';
import { colors } from '@/theme';
import { WhatsNew } from '@/whats-new';

/*
 * THE OPENING TAB WAS IGNORED (27 Oct): native tabs never render a hidden
 * trigger, so `index`'s redirect never ran and every launch landed on the first
 * visible tab, Shows. The router falls back to this anchor instead — a getter,
 * so it reads the Settings choice at launch rather than at import.
 */
const TAB_NAMES = ['profile', 'shows', 'movies', 'explore'];
export const unstable_settings = {
  get anchor() {
    const pref = getMeta('startTab');
    return pref && TAB_NAMES.includes(pref) ? pref : 'profile';
  },
};

/** TV Time's tab icons are about a third larger than the library's 24. */
const TAB_ICON = 30;

/** Every tab remounts on a language switch — see `remountOnLocale`. */
const SCREEN_LAYOUT = remountOnLocale();

export default function TabsLayout() {
  // THE TAB LABELS STAYED IN THE OLD LANGUAGE (15 Oct): this layout never
  // unmounts, nothing re-rendered it after a switch, and the compiler had
  // cached its t() calls besides. It listens for the change and is not memoised.
  'use no memo';
  const locale = useLocale();
  // Read once: the classic bar applies from the next launch (`classic-tab-bar`).
  const [classic] = useState(classicTabBarOn);
  const insets = useSafeAreaInsets();
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

  if (classic) {
    /*
     * 2.0.0's BAR, kept as it was. The inset is added to the height so the
     * icons and labels sit above the home indicator rather than squeezed into
     * a fixed 58 points with it (14 Oct). The four tabs name their own place to
     * VoiceOver, in the reader's language, because the hidden `index` is one of
     * the routes this bar counts.
     */
    const tabLabel = (label: string, n: number) =>
      Platform.OS === 'ios' ? t('a11y.tabOf', { label, n, total: 4 }) : undefined;
    return (
      <>
      <WhatsNew />
      <Tabs
        screenLayout={SCREEN_LAYOUT}
        screenListeners={{ tabPress: () => tapSelection() }}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: {
            backgroundColor: colors.bg,
            borderTopColor: colors.line,
            height: 60 + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom,
          },
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
        }}>
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="shows"
          options={{
            title: t('tabBar.shows'),
            tabBarAccessibilityLabel: tabLabel(t('tabBar.shows'), 1),
            tabBarIcon: ({ color }) => <MaterialCommunityIcons name="television-classic" size={TAB_ICON} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="movies"
          options={{
            title: t('tabBar.movies'),
            tabBarAccessibilityLabel: tabLabel(t('tabBar.movies'), 2),
            tabBarIcon: ({ color }) => <MaterialCommunityIcons name="movie-open-outline" size={TAB_ICON} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: t('tabBar.explore'),
            tabBarAccessibilityLabel: tabLabel(t('tabBar.explore'), 3),
            tabBarIcon: ({ color }) => <Ionicons name="search" size={TAB_ICON} color={color as string} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabBar.profile'),
            tabBarAccessibilityLabel: tabLabel(t('tabBar.profile'), 4),
            tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={TAB_ICON} color={color as string} />,
          }}
        />
      </Tabs>
      </>
    );
  }

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
