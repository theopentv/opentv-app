/**
 * The right half of the Shows tab on an open iPhone Duo. Empty until a show is
 * tapped, as decided on 29 Oct; the left half keeps its place. A summary rather
 * than the whole show page: that page is sized to the window, and its button
 * here opens it in full.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShowProgress } from '@/db';
import { statusText, t } from '@/i18n';
import { episodeMeta, showMeta } from '@/metadata';
import { progressColorOf, progressOf } from '@/show-status';
import { colors, radius, space } from '@/theme';

type Next = { season: number; episode: number } | null | 'unknown';

export function ShowPane({ show, next }: { show: ShowProgress | null; next: Next }) {
  if (!show) return <View style={s.pane} />;
  const m = showMeta(show.tvdbId);
  const image = m?.poster ?? show.posterUrl;
  const nextEp = next != null && next !== 'unknown' ? next : null;
  const title = nextEp ? episodeMeta(show.tvdbId, nextEp.season, nextEp.episode)?.title : null;
  return (
    <View style={s.pane}>
      <View style={s.card}>
        {image != null && <Image source={{ uri: image }} style={s.poster} contentFit="cover" />}
        <Text style={s.name} accessibilityRole="header" numberOfLines={2}>
          {show.name}
        </Text>
        {m?.status != null && <Text style={s.sub}>{statusText(m.status)}</Text>}
        <View style={s.track}>
          <View style={[s.bar, { width: `${progressOf(show) * 100}%`, backgroundColor: progressColorOf(show) }]} />
        </View>
        {nextEp && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/episode/${show.tvdbId}-s${nextEp.season}e${nextEp.episode}`)}>
            <Text style={s.code}>
              S{String(nextEp.season).padStart(2, '0')} | E{String(nextEp.episode).padStart(2, '0')}
            </Text>
            {title != null && (
              <Text style={s.sub} numberOfLines={1}>
                {title}
              </Text>
            )}
          </Pressable>
        )}
        <Pressable accessibilityRole="button" style={s.cta} onPress={() => router.push(`/show/${show.tvdbId}`)}>
          <Text style={s.ctaText}>{t('a11y.openShow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pane: { flex: 1 },
  card: { flex: 1, padding: space.lg, gap: space.sm },
  poster: { width: 160, height: 240, borderRadius: radius.card, alignSelf: 'center', backgroundColor: colors.raise },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: space.sm },
  sub: { color: colors.dim, fontSize: 14 },
  code: { color: colors.text, fontSize: 17, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden', marginVertical: space.xs },
  bar: { height: 4 },
  cta: {
    height: 46,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.onYellow, fontSize: 15, fontWeight: '700' },
});
