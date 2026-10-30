import { useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { type ViewInstance, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { NavHeader } from '@/components/ui';
import { APP_BADGES } from '@/badge-rules';
import { badgeById, type Badge } from '@/badges';
import { BadgeArt } from '@/components/badge-art';
import { colors, radius, ls } from '@/theme';
import { currentLocale, t } from '@/i18n';
import type { LocaleKey } from '@/locales/keys';
import { SITE_HOST, withLink } from '@/share-link';
import { oneAtATime } from '@/one-at-a-time';
import { intlTag } from '@/locale-resolve';

// ring-text descriptions for the app badges, like the real detail page
const APP_DESC_KEY: Record<string, LocaleKey> = {
  'voted-character': 'badge.desc.votedCharacter',
  'got-comment-like': 'badge.desc.gotCommentLike',
  'commented-episode': 'badge.desc.commentedEpisode',
  'created-meme': 'badge.desc.createdMeme',
  'gave-comment-like': 'badge.desc.gaveCommentLike',
  'chose-emotion': 'badge.desc.choseEmotion',
  'used-mobile-version': 'badge.desc.usedMobileVersion',
  'checked-user-profile': 'badge.desc.checkedUserProfile',
  'displayed-comments': 'badge.desc.displayedComments',
  'cleared-watchlist': 'badge.desc.clearedWatchlist',
  'reported-spoiler': 'badge.desc.reportedSpoiler',
  'used-web-version': 'badge.desc.usedWebVersion',
  'commented-show': 'badge.desc.commentedShow',
  'archived-show': 'badge.desc.archivedShow',
};

function describe(b: Badge): { title: string; desc: string } {
  const show = b.name ?? '';
  switch (b.kind) {
    case 'marathoner':
      return { title: t('badge.marathonerTitle'), desc: t('badge.marathonerDesc', { episodes: String(b.count), show, hours: String(b.hours) }) };
    case 'quick':
      return { title: t('badge.quickWatcherTitle'), desc: t('badge.quickWatcherDesc', { count: String(b.count), show }) };
    case 'serial':
      return { title: t('badge.serialWatcherTitle'), desc: t('badge.serialWatcherDesc', { count: String(b.count) }) };
    case 'voter':
      return { title: t('badge.voterTitle'), desc: t('badge.voterDesc', { count: String(b.count), show }) };
    case 'emoter':
      return { title: t('badge.emoterTitle'), desc: t('badge.emoterDesc', { count: String(b.count), show }) };
    case 'quizzer':
      return { title: t('badge.quizzerTitle'), desc: t('badge.quizzerDesc', { count: String(b.count) }) };
    case 'showoff':
      return { title: t('badge.showoffTitle'), desc: t('badge.showoffDesc', { year: b.year ?? '' }) };
    default:
      return {
        title: APP_BADGES.find(([a]) => a === b.app)?.[1] ?? t('badge.defaultTitle'),
        desc: b.app && APP_DESC_KEY[b.app] ? t(APP_DESC_KEY[b.app]) : '',
      };
  }
}

function longDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(intlTag(currentLocale()), { month: 'long', day: 'numeric', year: 'numeric' }).toLocaleUpperCase(currentLocale());
}

export default function BadgeScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardRef = useRef<ViewInstance>(null);

  const badge = badgeById(id);
  const meta = badge ? { ...describe(badge), date: badge.date } : null;

  if (!meta) return null;

  const share = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await Share.share({ url: uri });
    } catch {
      Share.share({ message: withLink(t('badge.shareMessage', { title: meta.title, desc: meta.desc })) }).catch(() => {});
      void Alert;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The native close, which iOS can move into the iPhone Duo's strip. */}
      <NavHeader close />

      <View ref={cardRef} collapsable={false} style={styles.card}>
        {badge && <BadgeArt kind={badge.kind} app={badge.app} art={badge.art} size={190} />}
        <View style={{ height: 40 }} />
        <Text accessibilityRole="header" style={styles.title}>{meta.title}</Text>
        {meta.desc !== '' && <Text style={styles.desc}>{meta.desc}</Text>}
        {longDate(meta.date) && <Text style={styles.date}>{longDate(meta.date)}</Text>}
        {/* THE NAME AND THE ADDRESS (2.0.3). The badge left the app as a medal,
            a title and a date, and nothing to say where it came from. Under
            the date rather than at the foot, which the Share button covers. */}
        <View style={styles.brand}>
          <Image source={require('@/assets/images/mark.png')} style={styles.mark} contentFit="contain" />
          <Text style={styles.brandText}>OPENTV</Text>
          <Text style={styles.brandUrl}>{SITE_HOST}</Text>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: insets.bottom + 24, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" style={styles.shareBtn} onPress={() => void oneAtATime('share', share)}>
          <Text style={styles.shareText}>{t('badge.share')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: colors.bg,
    gap: 6,
  },
  title: { color: colors.text, fontSize: 27, fontWeight: '800' },
  desc: { color: colors.text, fontSize: 17.5, textAlign: 'center', lineHeight: 25, marginTop: 10 },
  date: { color: colors.dim, fontSize: 12.5, fontWeight: '700', letterSpacing: ls(1), marginTop: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 28 },
  mark: { width: 18, height: 18 },
  brandText: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: ls(0.8) },
  brandUrl: { color: colors.dim, fontSize: 11, fontWeight: '700', marginStart: 2 },
  shareBtn: {
    backgroundColor: colors.yellow,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: 52,
  },
  shareText: { color: colors.onYellow, fontSize: 13.5, fontWeight: '800', letterSpacing: ls(1.2) },
});
