/**
 * Back and ⋯ for a page in the right half, which has no native header to borrow.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { useDetailPane } from '@/components/ui';
import { t } from '@/i18n';

export function PaneBar({ actions }: { actions?: SheetAction[] }) {
  const pane = useDetailPane();
  const [menu, setMenu] = useState(false);
  if (!pane) return null;
  return (
    <>
      {pane.canBack && (
        <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.close')} hitSlop={8} style={[s.btn, s.back]} onPress={pane.back}>
          <Ionicons name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color="#FFF" />
        </Pressable>
      )}
      {actions != null && (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={t('a11y.more')} hitSlop={8} style={[s.btn, s.more]} onPress={() => setMenu(true)}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
          </Pressable>
          <ActionSheet visible={menu} actions={actions} onClose={() => setMenu(false)} />
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: 12,
    zIndex: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  back: { start: 12 },
  more: { end: 12 },
});
