/**
 * "Sign in and get a month of Plus free" (2.0.3) — after an import finishes,
 * and once on the Profile tab for somebody already here with no account.
 *
 * IT SAYS WHAT IT IS NOT. No payment, no trial to cancel, nothing renews, and
 * an account stays optional: a free month that quietly became a subscription
 * is the trick people expect from an offer like this, and the card is where
 * that suspicion is answered, not a terms page.
 *
 * "No thanks" is one-way for BOTH cards (`declineFreeMonth`), so declining
 * after an import also means it is never asked again on the Profile tab.
 * Visibility is state, re-read on focus — signing in elsewhere hides it.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { track } from '@/analytics';
import { Text } from '@/components/text';
import { declineFreeMonth, freeMonthInviteShown } from '@/free-month';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { colors, radius, space } from '@/theme';

export function FreeMonthCard({ from, style }: { from: 'import' | 'profile'; style?: StyleProp<ViewStyle> }) {
  const [shown, setShown] = useState(freeMonthInviteShown);
  useFocusEffect(useCallback(() => setShown(freeMonthInviteShown()), []));
  if (!shown) return null;
  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <Ionicons name="sparkles" size={18} color={colors.yellow} />
        <Text style={s.title} accessibilityRole="header">
          {t('freeMonth.cardTitle')}
        </Text>
      </View>
      <Text style={s.body}>{t('freeMonth.cardBody')}</Text>
      <Text style={s.small}>{t('freeMonth.cardNoRenew')}</Text>
      <Pressable
        accessibilityRole="button"
        style={s.cta}
        onPress={() => {
          tapLight();
          track('free_month_invite', { from, answer: 'sign_in' });
          router.push('/sign-in');
        }}>
        <Text style={s.ctaText}>{t('freeMonth.cardCta')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          declineFreeMonth(from);
          setShown(false);
        }}>
        <Text style={s.no}>{t('freeMonth.cardNo')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.dim, fontSize: 14, lineHeight: 20 },
  small: { color: colors.faint, fontSize: 12.5, lineHeight: 18 },
  cta: {
    marginTop: space.xs,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onYellow, fontSize: 15, fontWeight: '700' },
  no: { color: colors.dim, fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: space.xs },
});
