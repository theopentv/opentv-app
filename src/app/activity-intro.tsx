/**
 * "New: Activity" (2.0.0, 22 Oct) — opened from the Profile banner, modelled
 * on puzzle-intro.tsx. Says what the friends feed is, and asks the one
 * question it raises: do YOUR reactions go into your followers' Activity?
 *
 * THE SWITCH IS THE EXISTING ONE. It starts at the current `feed` hidden
 * section and saves through `pushHiddenSections`, exactly as Edit profile's
 * "Show my reactions to followers" does — server first, local echo after.
 *
 * Either button answers (stamps `ACTIVITY_INTRO_ANSWERED`, which retires the
 * banner for good). Back stamps nothing — that is not an answer. A save that
 * cannot reach the server stamps nothing either, and says so.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACTIVITY_INTRO_ANSWERED } from '@/activity-intro';
import { communityErrorText } from '@/community-error-text';
import { pushHiddenSections } from '@/community-profiles';
import { Text } from '@/components/text';
import { ContentColumn, MenuRow, NavHeader, Screen } from '@/components/ui';
import { getMeta, setMeta } from '@/db';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { HIDDEN_SECTIONS_KEY, parseHiddenSections, sectionHidden, withSectionHidden } from '@/pure';
import { colors, ls, radius, space } from '@/theme';

const HOW = [
  { icon: '⭐', key: 'activityIntro.howFriends' as const },
  { icon: '🔒', key: 'activityIntro.howLocked' as const },
  { icon: '👥', key: 'activityIntro.howYours' as const },
] as const;

export default function ActivityIntroScreen() {
  const insets = useSafeAreaInsets();
  // Read once on mount, into state: this screen is fresh every time it opens.
  const [hidden] = useState(() => parseHiddenSections(getMeta(HIDDEN_SECTIONS_KEY)));
  const [show, setShow] = useState(() => !sectionHidden(hidden, 'feed'));
  const [busy, setBusy] = useState(false);

  const answer = async (then: () => void) => {
    if (busy) return;
    setBusy(true);
    tapLight();
    if (show === sectionHidden(hidden, 'feed')) {
      const next = withSectionHidden(hidden, 'feed', !show);
      try {
        await pushHiddenSections(next);
        setMeta(HIDDEN_SECTIONS_KEY, JSON.stringify(next));
      } catch (e) {
        setBusy(false);
        Alert.alert(t('editProfile.visibility.failedTitle'), communityErrorText(e));
        return;
      }
    }
    setMeta(ACTIVITY_INTRO_ANSWERED, '1');
    then();
  };

  return (
    <Screen>
      <NavHeader title={t('explore.pills.activity')} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <ContentColumn style={{ flex: 1, paddingHorizontal: space.xl }}>
          <View style={styles.body}>
            <Text style={styles.emoji}>💬</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {t('activityIntro.title')}
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
              trackId="activity.intro.share"
              title={t('activityIntro.share')}
              sub={t('feed.optOutSub')}
              right={<Switch value={show} onValueChange={setShow} disabled={busy} trackColor={{ true: colors.green }} />}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.cta}
            onPress={() => void answer(() => router.dismissTo('/explore?pill=Activity'))}
            disabled={busy}>
            <Text style={styles.ctaText}>{t('activityIntro.see')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.done, { marginBottom: space.lg + insets.bottom }]}
            onPress={() => void answer(() => router.back())}
            disabled={busy}>
            <Text style={styles.doneText}>{t('activityIntro.done')}</Text>
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
  done: { paddingVertical: 15, alignItems: 'center' },
  doneText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
