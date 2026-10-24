import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';

import { t } from '@/i18n';
import { colors } from '@/theme';

/**
 * A REAL ✕ FOR A PAGE THAT IS NOT A ROUTE, beside the iPhone Duo's strip.
 *
 * The comment writing pages are full-screen Modals, outside every navigation
 * bar, so their ✕ was drawn in the corner while every other page's close sat
 * in the strip under the clock. iOS only moves a bar button that belongs to a
 * navigation bar, so this gives the Modal one: a single-screen native stack
 * whose header holds nothing but the ✕. Off (children as they are) everywhere
 * there is no strip, where the page keeps its drawn ✕.
 */
export function StripClose({ enabled, onClose, children }: { enabled: boolean; onClose: () => void; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <ScreenStack style={styles.fill}>
      <ScreenStackItem
        screenId="write"
        style={StyleSheet.absoluteFill}
        headerConfig={{
          title: '',
          translucent: true,
          backgroundColor: 'transparent',
          hideShadow: true,
          color: colors.text,
          headerLeftBarButtonItems: [
            { type: 'button', index: 0, title: t('a11y.close'), icon: { type: 'sfSymbol', name: 'xmark' }, onPress: onClose },
          ],
        }}>
        {children}
      </ScreenStackItem>
    </ScreenStack>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.bg } });
