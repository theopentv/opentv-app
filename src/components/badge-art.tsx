/**
 * A badge, drawn by us: TV Time's medals are its own artwork. A show's badge is
 * its poster with the kind of feat on a small seal; anything else is the seal
 * alone. Dimmed until earned, as TV Time showed the ones still to get.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { BadgeInfo } from '@/badge-rules';
import { colors } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const KIND_ICON: Record<BadgeInfo['kind'], IconName> = {
  marathoner: 'walk',
  quick: 'stopwatch',
  serial: 'tv',
  voter: 'person',
  emoter: 'happy',
  quizzer: 'help',
  showoff: 'sparkles',
  app: 'ribbon',
};

const APP_ICON: Record<string, IconName> = {
  'voted-character': 'people',
  'got-comment-like': 'thumbs-up',
  'commented-episode': 'create',
  'created-meme': 'image',
  'gave-comment-like': 'heart',
  'chose-emotion': 'happy',
  'used-mobile-version': 'phone-portrait',
  'checked-user-profile': 'eye',
  'displayed-comments': 'flame',
  'cleared-watchlist': 'checkmark-done',
  'reported-spoiler': 'shield',
  'used-web-version': 'laptop',
  'commented-show': 'mic',
  'archived-show': 'archive',
};

export function BadgeArt({
  kind,
  app,
  art,
  size = 68,
  earned = true,
}: {
  kind: BadgeInfo['kind'];
  app?: string | null;
  art?: string | null;
  size?: number;
  earned?: boolean;
}) {
  const seal = Math.round(size * 0.36);
  const icon = (app != null ? APP_ICON[app] : null) ?? KIND_ICON[kind];
  return (
    <View style={{ width: size, height: size, opacity: earned ? 1 : 0.3 }}>
      {art != null ? (
        <>
          <Image source={{ uri: art }} style={[StyleSheet.absoluteFill, s.art, { borderRadius: size * 0.22 }]} contentFit="cover" />
          <View style={[s.seal, { width: seal, height: seal, borderRadius: seal / 2 }]}>
            <Ionicons name={icon} size={seal * 0.62} color={colors.onBrand} />
          </View>
        </>
      ) : (
        <View style={[s.plain, { borderRadius: size / 2 }]}>
          <Ionicons name={icon} size={size * 0.46} color={colors.onBrand} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  art: { backgroundColor: colors.raise },
  seal: {
    position: 'absolute',
    bottom: -3,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.card,
  },
  plain: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
});
