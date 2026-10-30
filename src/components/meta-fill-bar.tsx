/**
 * "Getting episode data… 884 / 1367", above the tab bar while a big library
 * fills in behind the app. Ignores touches: nothing here waits for it.
 */
import { useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { t } from '@/i18n';
import { useMetaFill } from '@/meta-fill';
import { colors, radius } from '@/theme';

/** Below this it is a launch's routine top-up, and over before it can be read. */
const WORTH_SHOWING = 20;

export function MetaFillBar() {
  const fill = useMetaFill();
  const insets = useSafeAreaInsets();
  // Only over the tabs: every other screen keeps its main button right here.
  const onTabs = useSegments()[0] === '(tabs)';
  if (!onTabs || !fill || fill.total < WORTH_SHOWING) return null;
  return (
    <View pointerEvents="none" style={[s.pill, { bottom: insets.bottom + 64 }]}>
      <Text style={s.text} numberOfLines={1}>
        {t('import.gettingEpisodeData')} {fill.done} / {fill.total}
      </Text>
      <View style={s.track}>
        <View style={[s.bar, { width: `${(fill.done / fill.total) * 100}%` }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    width: 260,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  text: { color: colors.text, fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  bar: { height: 3, backgroundColor: colors.brand },
});
