import { Stack } from 'expo-router';

import { colors } from '@/theme';

/**
 * A stack inside the Profile tab, only so the tab has a native header: the
 * bell and the ⋯ are header buttons there, and native header buttons are what
 * iOS moves into the iPhone Duo's strip. A tab on its own has no header.
 */
export default function ProfileTabLayout() {
  return <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }} />;
}
