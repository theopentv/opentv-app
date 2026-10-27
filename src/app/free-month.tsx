/**
 * "A month of Plus is yours" (2.0.3) — opened once, by `claimFreeMonth`, the
 * moment the server grants the month.
 *
 * AND THE ONE SIGN-UP QUESTION: "Where did you hear about OpenTV?". Here
 * because a granted month is the first sign-in of an account, which is what
 * "at sign-up" means for Apple and Google, where signing up and signing in are
 * the same button. Optional: Done without an answer sends nothing. The answer
 * is one of five channel names (`HEARD_FROM` on the server), never free text —
 * which channel brings people is the question, not whose path it was.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { track } from '@/analytics';
import { api } from '@/api';
import { getToken } from '@/community-session';
import { Text } from '@/components/text';
import { NavHeader, Screen } from '@/components/ui';
import { getMeta } from '@/db';
import { FREE_MONTH_UNTIL_KEY } from '@/free-month';
import { tapLight } from '@/haptics';
import { currentLocale, t } from '@/i18n';
import { intlTag } from '@/locale-resolve';
import { colors, radius, space } from '@/theme';

const CHANNELS = ['reddit', 'store', 'friend', 'creator', 'other'] as const;
type Channel = (typeof CHANNELS)[number];

export default function FreeMonthScreen() {
  const [until] = useState(() => getMeta(FREE_MONTH_UNTIL_KEY));
  const [picked, setPicked] = useState<Channel | null>(null);

  const done = () => {
    if (picked) {
      track('free_month_heard', { channel: picked });
      void getToken()
        .then((token) =>
          token ? api('/v1/me', { method: 'PATCH', token, body: { heard_from: picked } }) : undefined,
        )
        .catch(() => {
          // An unanswered survey is not worth a retry queue.
        });
    }
    router.back();
  };

  const date = until
    ? new Date(until).toLocaleDateString(intlTag(currentLocale()), { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Screen>
      <NavHeader close />
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.emoji}>🎁</Text>
        <Text style={s.title} accessibilityRole="header">
          {t('freeMonth.grantedTitle')}
        </Text>
        <Text style={s.body}>
          {date ? t('freeMonth.grantedUntil', { date }) : t('freeMonth.grantedNoDate')}
        </Text>

        <View style={s.question}>
          <Text style={s.qTitle}>{t('freeMonth.heardTitle')}</Text>
          <Text style={s.qHint}>{t('freeMonth.heardOptional')}</Text>
          <View style={s.chips}>
            {CHANNELS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityState={{ selected: picked === c }}
                style={[s.chip, picked === c && s.chipOn]}
                onPress={() => {
                  tapLight();
                  setPicked(picked === c ? null : c);
                }}>
                <Text style={[s.chipText, picked === c && s.chipTextOn]}>{t(`freeMonth.heard.${c}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable accessibilityRole="button" style={s.cta} onPress={done}>
          <Text style={s.ctaText}>{t('freeMonth.done')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  emoji: { fontSize: 44, textAlign: 'center', marginTop: space.lg },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.dim, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  question: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
  qTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  qHint: { color: colors.faint, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.lift,
  },
  chipOn: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.onYellow },
  cta: {
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onYellow, fontSize: 16, fontWeight: '700' },
});
