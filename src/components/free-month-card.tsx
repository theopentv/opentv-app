/**
 * "Try Plus free for a month" (2.0.3) — after an import finishes, and in the
 * Profile banner stack, for everybody who may have it: no account yet, or
 * signed in and never claimed (`freeMonthInviteDue`).
 *
 * IT SAYS WHAT IT IS NOT. No card, no trial to cancel, nothing renews: a free
 * month that quietly became a subscription is the trick people expect from an
 * offer like this, and the card is where that suspicion is answered, not a
 * terms page. Signed out, it also says the month needs an account, before the
 * tap rather than after it.
 *
 * "Try it free" is the only thing in the app that asks for the month
 * (`acceptFreeMonth`). Signed in it is claimed there and then, and "A month
 * of Plus is yours" opens; signed out it opens sign-in, which claims it.
 *
 * BEFORE IT OPENS (`freeMonthIsSoon`) the card says the date and asks "Count me
 * in": signing in saves the claim, the card then confirms it, and the claim is
 * made on the first launch after the dashboard's switch opens. A card that
 * invited a sign-in and then vanished read as a trick (30 Oct).
 *
 * "No thanks" is one-way for BOTH cards (`declineFreeMonth`), so declining
 * after an import also means it is never asked again on the Profile tab.
 * Visibility is state, re-read on focus — signing in elsewhere hides it.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { hasAccount } from '@/community-session';
import { acceptFreeMonth, closeFreeMonthCounted, declineFreeMonth, freeMonthCounted, freeMonthInviteShown, freeMonthPending } from '@/free-month';
import { freeMonthIsSoon } from '@/free-month-rules';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { isPlus } from '@/plus';
import { colors, radius, space } from '@/theme';

export function FreeMonthCard({ from, style }: { from: 'import' | 'profile'; style?: StyleProp<ViewStyle> }) {
  const [shown, setShown] = useState(freeMonthInviteShown);
  const [counted, setCounted] = useState(freeMonthCounted);
  const [soon, setSoon] = useState(() => freeMonthIsSoon(Date.now()));
  const [plus, setPlus] = useState(isPlus);
  const [signedIn, setSignedIn] = useState(hasAccount);
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setShown(freeMonthInviteShown());
      setCounted(freeMonthCounted());
      setSoon(freeMonthIsSoon(Date.now()));
      setPlus(isPlus());
      setSignedIn(hasAccount());
    }, []),
  );
  if (!shown && !counted) return null;

  const accept = async () => {
    if (busy) return;
    tapLight();
    setBusy(true);
    await acceptFreeMonth(from);
    setBusy(false);
    setShown(freeMonthInviteShown());
    setCounted(freeMonthCounted());
    // Signed in and still pending: the claim could not reach the server. It is
    // made at the next launch anyway; say so rather than a button that did nothing.
    if (signedIn && !soon && freeMonthPending()) Alert.alert(t('freeMonthOptIn.claimFailed'));
  };
  // Somebody on Plus hears that it goes on top, not that Plus is on offer.
  const onTop = soon && plus;
  const title = counted ? 'countedTitle' : onTop ? 'soonPlusTitle' : soon ? 'soonTitle' : 'cardTitle';
  const body = counted
    ? onTop
      ? 'countedPlusBody'
      : 'countedBody'
    : onTop
      ? 'soonPlusBody'
      : soon
        ? 'soonBody'
        : 'cardBody';
  return (
    <View style={[s.card, style]}>
      <View style={s.head}>
        <Ionicons name="sparkles" size={18} color={colors.yellow} />
        <Text style={s.title} accessibilityRole="header">
          {t(`freeMonthOptIn.${title}`)}
        </Text>
        {counted && (
          <Pressable
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('ui.dismiss')}
            onPress={() => {
              closeFreeMonthCounted();
              setCounted(false);
            }}>
            <Ionicons name="close" size={18} color={colors.dim} />
          </Pressable>
        )}
      </View>
      <Text style={s.body}>{t(`freeMonthOptIn.${body}`)}</Text>
      {!signedIn && <Text style={s.small}>{t('freeMonthOptIn.cardAccount')}</Text>}
      {!counted && (
        <Pressable accessibilityRole="button" style={s.cta} disabled={busy} onPress={() => void accept()}>
          {busy ? (
            <ActivityIndicator color={colors.onYellow} />
          ) : (
            <Text style={s.ctaText}>{t(soon ? 'freeMonthOptIn.soonCta' : 'freeMonthOptIn.cardCta')}</Text>
          )}
        </Pressable>
      )}
      {!counted && (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            declineFreeMonth(from);
            setShown(false);
          }}>
          <Text style={s.no}>{t('freeMonth.cardNo')}</Text>
        </Pressable>
      )}
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
