/**
 * WHAT POSTING DOES, IN THE COMPOSER (Partner Terms §A10.3(a), §B3): shown
 * before somebody first posts to CommsUni, then in compact form, with links
 * to the full §B3 text and to the list of connected apps. A notice after
 * posting does not count, so it sits under the text box.
 */
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { t } from '@/i18n';
import { colors } from '@/theme';

const SEEN = 'commsuniNoticeSeen';
const B3_URL = 'https://commsuni.tv/terms#b3-what-happens-when-you-post-read-this-before-you-write';
const APPS_URL = 'https://commsuni.tv/privacy';

/** Call after a comment really went to CommsUni: the notice turns compact. */
export const markCommsuniNoticeSeen = (): void => setMeta(SEEN, '1');

export function CommsuniNotice() {
  // State, read once: the composer must not flip to compact while it is open.
  const [full] = useState(() => getMeta(SEEN) !== '1');
  return (
    <View style={s.box}>
      <Text style={s.text}>{t(full ? 'commsuni.notice.full' : 'commsuni.notice.short')}</Text>
      <View style={s.links}>
        <Pressable accessibilityRole="link" hitSlop={6} onPress={() => void Linking.openURL(B3_URL)}>
          <Text style={s.link}>{t('commsuni.notice.whatHappens')}</Text>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={6} onPress={() => void Linking.openURL(APPS_URL)}>
          <Text style={s.link}>{t('commsuni.notice.apps')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  text: { color: colors.dim, fontSize: 12, lineHeight: 16 },
  links: { flexDirection: 'row', gap: 14 },
  link: { color: colors.blue, fontSize: 12, fontWeight: '600' },
});

/**
 * THE AGE GATE (§B9): posting to CommsUni needs 16, worldwide. Asked when
 * somebody turns sharing on, never assumed; "No" keeps them reading and
 * reporting, which §B9.3 leaves open to everyone.
 */
export function confirmAge16(onYes: () => void, onNo?: () => void): void {
  Alert.alert(t('commsuni.age.title'), t('commsuni.age.body'), [
    {
      text: t('commsuni.age.no'),
      style: 'cancel',
      onPress: () => {
        Alert.alert(t('commsuni.age.underTitle'), t('commsuni.age.underBody'));
        onNo?.();
      },
    },
    { text: t('commsuni.age.yes'), onPress: onYes },
  ]);
}
