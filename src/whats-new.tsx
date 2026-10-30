/**
 * "What's new" — a small dialog, once per version, for people who UPDATED.
 *
 * DECIDED ONCE, AT LAUNCH. Somebody already onboarded when the app starts is
 * an existing user on a new version, and is owed the dialog. Somebody not yet
 * onboarded is a new install: there is nothing "new" to them, so the version
 * is stamped as seen on the spot and onboarding later in the same session
 * never brings it up.
 *
 * Adding a version: add its keys to the six locale files and a row to NOTES.
 * A version with no row shows nothing.
 */
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getMeta, setMeta } from '@/db';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import type { LocaleKey } from '@/locales/keys';
import { isOnboarded } from '@/session-store';
import { ACCENTS, colors, space, ls } from '@/theme';

const KEY = 'whatsNewSeen';

/** Each item's own tint: a list of five identical rows reads as small print. */
// `to`: where a tap on the row goes, so the news is one tap from the thing it names.
const NOTES: Record<string, { icon: string; tint: string; key: LocaleKey; iosOnly?: boolean; to?: Href }[]> = {
  // 2.0.0–2.0.2 shipped with no row here, so nobody who updated was told
  // anything (Mahmood noticed on 27 Oct). Every release gets a row.
  // 2.0.4 repeats 2.0.3's rows: iOS went from 2.0.2 straight to 2.0.4, and the
  // TV Time re-import line is the one thing those people most need to read.
  // No free-month row: the offer is switched on from the dashboard and shows
  // itself on the Profile when it is open (Mahmood, 28 Oct).
  '2.1.0': [
    { icon: '🖼️', tint: '#3E8BFF', key: 'whatsNew.v210.cover', to: '/edit-profile' },
    { icon: '🏅', tint: ACCENTS.yellow, key: 'whatsNew.v210.badges', to: '/stats' },
    { icon: '📥', tint: '#9B7BFF', key: 'whatsNew.v210.imports' },
    { icon: '📅', tint: '#FF7A1A', key: 'whatsNew.v210.upcoming' },
    { icon: '🛠️', tint: '#78BE3D', key: 'whatsNew.v210.fixes' },
  ],
  '2.0.4': [
    { icon: '🧘', tint: '#78BE3D', key: 'whatsNew.v204.simpleView', to: '/settings?tab=app' },
    { icon: '📥', tint: '#3E8BFF', key: 'whatsNew.v203.imports', to: '/import' },
    { icon: '🧩', tint: '#9B7BFF', key: 'whatsNew.v203.everything', to: '/edit-profile' },
    { icon: '🔔', tint: '#FF7A1A', key: 'whatsNew.v203.puzzle', to: '/puzzle-settings' },
    { icon: '📱', tint: '#FF4D8D', key: 'whatsNew.v203.classic', iosOnly: true, to: '/settings?tab=app' },
    { icon: '🛠️', tint: '#78BE3D', key: 'whatsNew.v203.fixes', to: '/import' },
  ],
  '2.0.3': [
    { icon: '📥', tint: '#3E8BFF', key: 'whatsNew.v203.imports' },
    { icon: '🎁', tint: ACCENTS.yellow, key: 'whatsNew.v203.freeMonth' },
    { icon: '🧩', tint: '#9B7BFF', key: 'whatsNew.v203.everything' },
    { icon: '🔔', tint: '#FF7A1A', key: 'whatsNew.v203.puzzle' },
    // The setting exists only on iOS (`classic-tab-bar`): Android has no glass bar to opt out of.
    { icon: '📱', tint: '#FF4D8D', key: 'whatsNew.v203.classic', iosOnly: true },
    { icon: '🛠️', tint: '#78BE3D', key: 'whatsNew.v203.fixes' },
  ],
  '1.7.0': [
    { icon: '🎯', tint: ACCENTS.yellow, key: 'whatsNew.v170.goal' },
    { icon: '📲', tint: '#3E8BFF', key: 'whatsNew.v170.moving' },
    { icon: '📱', tint: '#9B7BFF', key: 'whatsNew.v170.ipad' },
    { icon: '💻', tint: '#FF4D8D', key: 'whatsNew.v170.devices' },
    { icon: '🛠️', tint: '#78BE3D', key: 'whatsNew.v170.fixes' },
  ],
  '1.6.8': [
    { icon: '🎨', tint: ACCENTS.yellow, key: 'whatsNew.v168.templates' },
    { icon: '🎃', tint: '#FF7A1A', key: 'whatsNew.v168.seasonal' },
    { icon: '📱', tint: '#9B7BFF', key: 'whatsNew.v168.icons' },
    { icon: '🧩', tint: '#3E8BFF', key: 'whatsNew.v168.blocks' },
    { icon: '✉️', tint: '#78BE3D', key: 'whatsNew.v168.message' },
  ],
  '1.6.6': [
    { icon: '💬', tint: ACCENTS.yellow, key: 'whatsNew.v166.comments' },
    { icon: '🌐', tint: '#3E8BFF', key: 'whatsNew.v166.translate' },
    { icon: '🖼️', tint: '#FF4D8D', key: 'whatsNew.v166.banner' },
    { icon: '✏️', tint: '#78BE3D', key: 'whatsNew.v166.username' },
    { icon: '☁️', tint: '#9B7BFF', key: 'whatsNew.v166.backup' },
  ],
};

const version = (): string => Constants.expoConfig?.version ?? '';
let owed = false;

export function decideWhatsNewAtLaunch(): void {
  try {
    const v = version();
    if (!v || getMeta(KEY) === v) return;
    if (isOnboarded() && NOTES[v]) owed = true;
    else setMeta(KEY, v);
  } catch {
    // Never let a dialog stand between somebody and their library.
  }
}

/** The dialog itself. Mounted once, on the tabs. */
export function WhatsNew() {
  // Taken in the initialiser, so it is decided per mount, and stamped the
  // moment it is shown: closing the app mid-dialog does not bring it back.
  const [notes, setNotes] = useState(() => {
    if (!owed) return null;
    owed = false;
    try {
      setMeta(KEY, version());
    } catch {
      // Shown again next launch — harmless.
    }
    tapLight();
    return NOTES[version()]?.filter((n) => !n.iosOnly || Platform.OS === 'ios') ?? null;
  });
  if (!notes) return null;
  const close = () => setNotes(null);

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close}>
        {/* A Pressable that does nothing, so a tap on the card is not a tap on the backdrop. */}
        <Pressable style={s.card} onPress={() => {}}>
          <Pressable style={s.x} hitSlop={12} onPress={close} accessibilityLabel={t('whatsNew.close')}>
            <Text style={s.xText}>✕</Text>
          </Pressable>
          <View style={s.head}>
            <Image source={require('@/assets/images/icon.png')} style={s.logo} />
            <View style={s.pill}>
              <Text style={s.pillText}>{version()}</Text>
            </View>
          </View>
          <Text style={s.title}>{t('whatsNew.title')}</Text>
          {/* Scrolls when the rows are taller than the screen; the button stays below. */}
          <ScrollView style={s.scroll} contentContainerStyle={s.list} persistentScrollbar>
            {notes.map((n) => (
              // Brand colours, not the theme's: this is OpenTV saying hello.
              <Pressable
                key={n.key}
                disabled={!n.to}
                accessibilityRole={n.to ? 'button' : undefined}
                onPress={() => {
                  close();
                  if (n.to) router.push(n.to);
                }}
                style={[s.row, { backgroundColor: n.tint + '1F', borderColor: n.tint + '40' }]}>
                <View style={[s.iconWrap, { backgroundColor: n.tint + '33' }]}>
                  <Text style={s.icon}>{n.icon}</Text>
                </View>
                <Text style={s.text}>{t(n.key)}</Text>
                {n.to ? <Text style={s.chev}>›</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={s.done} onPress={close}>
            <Text style={s.doneText}>{t('whatsNew.done')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Clear of the status bar and home indicator when the card is at full height.
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: space.lg, paddingVertical: 60 },
  card: { maxHeight: '100%', backgroundColor: '#141416', borderRadius: 24, padding: space.lg, paddingTop: 26, borderWidth: 1, borderColor: '#26262A' },
  x: { position: 'absolute', top: 16, end: 16, zIndex: 1 },
  xText: { color: colors.dim, fontSize: 18, fontWeight: '700' },
  head: { alignItems: 'center', gap: 10 },
  logo: { width: 64, height: 64, borderRadius: 16 },
  pill: { backgroundColor: ACCENTS.yellow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  pillText: { color: '#000', fontSize: 13, fontWeight: '900', letterSpacing: ls(0.5) },
  title: { color: '#FFF', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  scroll: { flexShrink: 1 },
  list: { gap: 8 },
  chev: { color: colors.dim, fontSize: 22, fontWeight: '300' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 19 },
  text: { color: '#FFF', fontSize: 14.5, lineHeight: 20, flex: 1 },
  done: { marginTop: 18, backgroundColor: ACCENTS.yellow, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  doneText: { color: '#000', fontSize: 16, fontWeight: '900' },
});
