/**
 * "Your free month has ended" (2.0.3) — opened once, by `freeMonthAfterRefresh`,
 * at the first launch after the month passed, and never to somebody who bought.
 *
 * WHAT THEY USED, ONLY WHERE IT IS KNOWN. The Plus gates they passed during the
 * month (`noteFreeMonthUse`) and a Cloud Backup that ran inside it; nothing is
 * guessed. A month in which none of those happened gets the plain list of what
 * Plus includes instead of "you used nothing", which would be both a guess and
 * a reproach.
 *
 * THE DATA LINE IS THE POINT. The fear at the end of any trial is that
 * something is about to be taken away, and here nothing is: the library is on
 * the phone and the tracker is free. It is said before the prices.
 *
 * Annual first, the lowest price per month; then monthly; then "No thanks",
 * which only closes. Prices come from the store, never from here (see the
 * paywall's note on that).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PurchasesPackage } from 'react-native-purchases';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { track } from '@/analytics';
import { Text } from '@/components/text';
import { NavHeader, Screen } from '@/components/ui';
import { freeMonthUsed } from '@/free-month';
import { FREE_MONTH_USES, type FreeMonthUse } from '@/free-month-rules';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { buy, getOffering, type Plans } from '@/purchases';
import { colors, radius, space } from '@/theme';

/** Each use, in the words the paywall already says it in. */
const LABEL: Record<FreeMonthUse, Parameters<typeof t>[0]> = {
  backup: 'plus.benefit.backup',
  stats: 'plus.benefit.stats',
  themes: 'plus.benefit.themes',
  profile: 'plus.benefit.profile',
  filters: 'plus.benefit.filters',
};
const ICON: Record<FreeMonthUse, keyof typeof Ionicons.glyphMap> = {
  backup: 'cloud-upload-outline',
  stats: 'stats-chart-outline',
  themes: 'color-palette-outline',
  profile: 'grid-outline',
  filters: 'funnel-outline',
};

export default function FreeMonthEndedScreen() {
  const [used] = useState(freeMonthUsed);
  const list = used.length > 0 ? used : FREE_MONTH_USES;
  const [plans, setPlans] = useState<Plans | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getOffering().then((r) => {
      if (live && r.ok) setPlans(r.value);
    });
    return () => {
      live = false;
    };
  }, []);

  const go = async (plan: 'annual' | 'monthly', pkg: PurchasesPackage) => {
    if (busy) return;
    tapLight();
    setBusy(true);
    const r = await buy(pkg);
    setBusy(false);
    if (r.ok && r.value) {
      track('plus_purchased', { plan, from: 'free_month_ended', code: 0 });
      router.back();
      return;
    }
    if (!r.ok && r.reason === 'cancelled') return;
    Alert.alert(t('plus.failedTitle'), t('plus.failedBody'));
  };

  const plan = (kind: 'annual' | 'monthly') => {
    const pkg = plans?.[kind];
    if (!pkg) return null;
    const primary = kind === 'annual';
    return (
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={[s.plan, primary ? s.planPrimary : s.planSecondary]}
        onPress={() => void go(kind, pkg)}>
        <Text style={[s.planText, primary && s.planTextPrimary]}>
          {t(primary ? 'freeMonthOptIn.endedAnnual' : 'freeMonthOptIn.endedMonthly', {
            price: pkg.product.priceString,
          })}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <NavHeader close />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.title} accessibilityRole="header">
          {t('freeMonthOptIn.endedTitle')}
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>
            {t(used.length > 0 ? 'freeMonthOptIn.endedUsed' : 'freeMonthOptIn.endedIncludes')}
          </Text>
          {list.map((u) => (
            <View key={u} style={s.row}>
              <Ionicons name={ICON[u]} size={18} color={colors.yellow} />
              <Text style={s.rowText}>{t(LABEL[u])}</Text>
            </View>
          ))}
        </View>

        <View style={s.safe}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={s.safeText}>{t('freeMonthOptIn.endedSafe')}</Text>
        </View>

        {busy ? <ActivityIndicator color={colors.yellow} /> : null}
        {plan('annual')}
        {plan('monthly')}

        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <Text style={s.no}>{t('freeMonth.cardNo')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: space.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.md,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, color: colors.dim, fontSize: 14, lineHeight: 20 },
  safe: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  safeText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 22 },
  plan: { minHeight: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  planPrimary: { backgroundColor: colors.yellow },
  planSecondary: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.lift },
  planText: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  planTextPrimary: { color: colors.onYellow },
  no: { color: colors.dim, fontSize: 15, fontWeight: '600', textAlign: 'center', paddingVertical: space.xs },
});
