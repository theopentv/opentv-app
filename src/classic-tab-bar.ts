import { Dimensions, Platform } from 'react-native';

import { getMeta, setMeta } from '@/db';

/**
 * THE CLASSIC TAB BAR (2.0.1): 2.0.0's bar, flat and full width along the
 * bottom, for anybody who does not want iOS 26's floating glass one.
 *
 * iOS only: Android's native bar is Material, with no glass to opt out of.
 * Not offered where the screen is wider than any slab iPhone (the iPhone Duo,
 * read from its size), because there the native bar is the one iOS moves into
 * the strip beside the clock, and the classic one would stay a row at the
 * bottom of a screen built not to have one.
 *
 * Read once, when the tabs mount: switching navigators under a live tree loses
 * the navigation state, so the choice applies the next time the app opens.
 */
const KEY = 'classicTabBar';

export function classicTabBarOffered(): boolean {
  if (Platform.OS !== 'ios') return false;
  const { width, height } = Dimensions.get('screen');
  return Platform.isPad || Math.min(width, height) <= 440;
}

export const classicTabBarOn = (): boolean => classicTabBarOffered() && getMeta(KEY) === '1';

export const setClassicTabBar = (on: boolean): void => setMeta(KEY, on ? '1' : '');
