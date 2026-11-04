/**
 * "Un-marked S2E3 · Undo" — a few seconds to take back something that cost data.
 *
 * ONE TOAST FOR THE WHOLE APP, mounted once in `_layout.tsx` and raised from
 * anywhere with `showUndo`. A screen-owned toast dies with its screen, and the
 * commonest un-mark happens in the Mark-as sheet, which closes the moment the
 * row is tapped.
 *
 * IN A FULL-WINDOW OVERLAY ON iOS because every screen that un-marks is a
 * native modal, and a native modal is drawn above anything the root view
 * holds: a plain absolutely-positioned toast would sit under the page it is
 * about. Android's modals live inside the stack, so a plain view after it
 * already draws on top. Touches outside the pill pass straight through.
 */
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { classicTabBarOn } from '@/classic-tab-bar';
import { Text } from '@/components/text';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { colors, radius } from '@/theme';

/** Long enough to read the line and reach the button; short enough not to linger. */
const SHOW_MS = 5000;

/**
 * ABOVE THE TAB BAR, NOT ON IT (4 Nov). Low on the screen as asked, but on a
 * tab screen the pill covered Shows/Movies/Explore/Profile for its 5 s. The
 * bar's height is not readable from out here (this sits outside the tabs), so
 * these are the bars' own heights: classic 60 (tabs/_layout), Material 3's
 * navigation bar 80 dp, and the iOS floating bar with room to spare.
 */
const tabBarHeight = (classic: boolean) => (classic ? 60 : Platform.OS === 'ios' ? 64 : 80);

type Toast = { id: number; message: string; onUndo: () => void };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(t: Toast | null) => void>();

function set(next: Toast | null): void {
  current = next;
  if (timer) clearTimeout(timer);
  timer = next ? setTimeout(() => set(null), SHOW_MS) : null;
  listeners.forEach((fn) => fn(next));
}

/** Show `message` with an Undo button. A newer toast replaces an older one,
 *  whose Undo is then gone — the same as every system snackbar. */
export function showUndo(message: string, onUndo: () => void): void {
  set({ id: Date.now(), message, onUndo });
  AccessibilityInfo.announceForAccessibility(`${message}. ${t('unmark.undo')}`);
}

export function UndoToast() {
  const insets = useSafeAreaInsets();
  const onTab = useSegments()[0] === '(tabs)';
  const [classic] = useState(classicTabBarOn);
  const [toast, setToast] = useState<Toast | null>(current);
  // THE SECONDS LEFT, on the button itself (Mahmood, 4 Nov): "Undo 4, 3, 2, 1"
  // says how long the choice is open better than a bar that just vanishes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [toast]);
  // A toast's id is the moment it was shown, so the count needs no state of its own.
  const left = toast ? Math.min(SHOW_MS / 1000, Math.max(1, Math.ceil((toast.id + SHOW_MS - now) / 1000))) : 0;

  const body = toast && (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        style={[s.pill, { bottom: insets.bottom + 12 + (onTab ? tabBarHeight(classic) : 0) }]}
        accessibilityLiveRegion="polite">
        <Text style={s.text} numberOfLines={2}>
          {toast.message}
        </Text>
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          onPress={() => {
            tapLight();
            set(null);
            toast.onUndo();
          }}>
          <Text style={s.undo}>
            {t('unmark.undo')} <Text style={s.count}>{left}</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
  if (!body) return null;
  return Platform.OS === 'ios' ? <FullWindowOverlay>{body}</FullWindowOverlay> : body;
}

const s = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  text: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  undo: { color: colors.yellow, fontSize: 15, fontWeight: '800' },
  count: { fontVariant: ['tabular-nums'] },
});
