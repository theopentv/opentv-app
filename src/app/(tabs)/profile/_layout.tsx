import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { colors } from '@/theme';

/**
 * A stack inside the Profile tab, only so the tab has a native header: the
 * bell and the ⋯ are header buttons there, and native header buttons are what
 * iOS moves into the iPhone Duo's strip. A tab on its own has no header.
 */
export default function ProfileTabLayout() {
  // THE DEFAULTS THE SCREEN'S OWN OPTIONS ARRIVE ON TOP OF (4 Nov). `index.tsx`
  // sets a transparent, untitled header from inside its render, and until that
  // lands -- or on a path that returns before it -- the stack drew its default:
  // a white bar titled with the route's file name, "index" (L8X, Android 2.2.2).
  return <Stack screenOptions={{ title: '', headerTransparent: true, headerBackTitle: t('a11y.back'), contentStyle: { backgroundColor: colors.bg } }} />;
}
