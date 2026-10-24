/**
 * Bottom sheet of icon rows — the shape TV Time used for a show's menu.
 *
 * Deliberately not ActionSheetIOS: the system sheet can't show icons, and a
 * long list of plain text rows reads as a wall. Rows here carry the same icon
 * vocabulary as the rest of the app, so the menu is scannable at a glance.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { COMMENTS_SPLIT_MIN_W } from '@/pure';
import { colors, radius, space } from '@/theme';

export type SheetAction = {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** renders red — reserved for anything that destroys data */
  destructive?: boolean;
  /** for a sheet that is a choice: marks the current one with a green check
   *  and announces it as selected. Left out, the row is a plain action. */
  selected?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  title,
  titleAction,
  actions,
  onClose,
  children,
}: {
  visible: boolean;
  title?: string;
  /** A small button at the end of the title line (e.g. "Reset"). */
  titleAction?: { label: string; a11y?: string; onPress: () => void };
  actions: SheetAction[];
  onClose: () => void;
  /** Content in place of (or after) the rows — the rating breakdown is a
   *  sheet with no actions, and wants this one's slide, backdrop and close. */
  children?: ReactNode;
}) {
  // Inside a Modal the safe-area context reads zero (see useTopInset in
  // ui.tsx); initialWindowMetrics is filled natively and survives it. On the
  // closed iPhone Duo the trailing inset is the 84pt clock strip -- without it
  // the end of every row (the green checkmark) sat under the strip.
  const live = useSafeAreaInsets();
  const init = initialWindowMetrics?.insets;
  const insets = {
    top: live.top || init?.top || 0,
    bottom: live.bottom || init?.bottom || 0,
    left: live.left || init?.left || 0,
    right: live.right || init?.right || 0,
  };
  const { width, height } = useWindowDimensions();
  // A SHEET STAYS IN ONE HALF on a wide screen (open iPhone Duo, iPad): the
  // fold runs down the middle, and a system sheet slides aside from it. Ours
  // keeps to the trailing half, the thumb side and where the strip already is.
  const oneHalf = width >= COMMENTS_SPLIT_MIN_W;
  // Modal's own "slide" would drag the backdrop up with the sheet, showing its
  // top edge — so the sheet slides while the backdrop only fades.
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      slide.setValue(1);
      return;
    }
    Animated.timing(slide, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        {/* The backdrop is the way out for a screen reader too: `Modal` already
            confines focus to the sheet on both platforms, and the escape
            gesture reaches nothing, so the one element that closes is named. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('a11y.close')} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          oneHalf
            ? { width: Math.min(Math.round(width / 2) - insets.right, 420), right: insets.right, left: undefined, borderTopLeftRadius: 16, borderTopRightRadius: 16 }
            : { paddingLeft: insets.left, paddingRight: insets.right },
          {
            paddingBottom: Math.max(insets.bottom, 14),
            // a long list (sixteen Wrapped periods) scrolls inside the sheet
            // instead of pushing the title under the status bar
            maxHeight: height - insets.top - 24,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }],
          },
        ]}>
        {title != null && (
          <View>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            {titleAction && (
              <Pressable
                style={styles.titleAction}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={titleAction.a11y ?? titleAction.label}
                onPress={() => {
                  titleAction.onPress();
                  onClose();
                }}>
                <Text style={styles.titleActionText}>{titleAction.label}</Text>
              </Pressable>
            )}
          </View>
        )}
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {actions.map((a, i) => (
          <Pressable
            key={a.text}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityState={a.selected != null ? { selected: a.selected } : undefined}
            onPress={() => {
              onClose();
              // let the sheet finish closing before the action pushes a screen
              // or opens its own alert, or the two animations fight
              requestAnimationFrame(a.onPress);
            }}>
            <Ionicons name={a.icon} size={21} color={a.destructive ? colors.danger : colors.text} />
            <Text style={[styles.label, a.destructive && { color: colors.danger }]} numberOfLines={1}>
              {a.text}
            </Text>
            {a.selected && <Ionicons name="checkmark" size={20} color={colors.green} />}
          </Pressable>
        ))}
        {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 6,
  },
  title: {
    color: colors.dim,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: space.lg,
  },
  titleAction: {
    position: 'absolute',
    end: space.lg,
    top: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.yellow,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  titleActionText: { color: colors.yellow, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: space.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  /*
   * A PRESS IS A DARKENING, NOT A COLOUR. It was '#26262A' — a lighter grey
   * than the sheet on black, and a near-black slab on white, so pressing a row
   * in the light theme turned it dark and took its label with it.
   *
   * `lift` is the one that moves AWAY from the surface in each direction — it
   * lightens on black, which is what the old value did, and darkens on paper.
   * `sink` darkens in both and would have flattened the press on a dark sheet.
   */
  rowPressed: { backgroundColor: colors.lift },
  label: { color: colors.text, fontSize: 16.5, flex: 1 },
});
