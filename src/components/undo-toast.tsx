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
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Text } from '@/components/text';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { colors, radius } from '@/theme';

/** Long enough to read the line and reach the button; short enough not to linger. */
const SHOW_MS = 5000;

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
  const [toast, setToast] = useState<Toast | null>(current);
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  const body = toast && (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(180)}
        style={[s.pill, { bottom: insets.bottom + 72 }]}
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
          <Text style={s.undo}>{t('unmark.undo')}</Text>
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
});
