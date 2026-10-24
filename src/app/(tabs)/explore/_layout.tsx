import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** A stack only so the tab has a native header: SplitHost shows it while a page
 *  is open beside the list, and iOS moves its close button into the iPhone
 *  Duo's strip. Hidden the rest of the time. */
export default function TabLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
