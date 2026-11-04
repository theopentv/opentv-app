/**
 * Claude & ChatGPT — let a chatbot read your OpenTV Backup when you ask it to.
 *
 * FOUR DOORS, ONE AT A TIME. Plus, an account, OpenTV Backup, and only then the
 * connector. Each door is the existing screen for it (paywall, sign-in, cloud
 * backup) rather than a copy: this screen says why it is needed and sends you
 * there, and comes back to the next door on focus.
 *
 * CONSENT FIRST, NOTHING BEFORE IT. What they will read, what they will not,
 * and where your questions go are said in plain words before a code can exist.
 * The words stay on screen afterwards, above the steps, because the moment
 * somebody adds a second chatbot is a moment to read them again.
 *
 * THE COUNTDOWN IS STATE. `now` is set by an interval React owns; reading
 * `Date.now()` during render is exactly what the compiler memoises away (see
 * the React Compiler trap in CLAUDE.md), and the clock would sit on 5:00.
 *
 * Analytics: only the `trackId`s of the buttons — never a code, an id, or which
 * chatbot somebody connected.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { ApiError } from '@/api';
import { backupDestination } from '@/cloud-backup';
import { communityErrorText } from '@/community-error-text';
import { hasAccount } from '@/community-session';
import { ErrorBar, NavHeader, PillButton, Screen } from '@/components/ui';
import { tapLight } from '@/haptics';
import { currentLocale, t } from '@/i18n';
import { intlTag } from '@/locale-resolve';
import {
  fetchMcpConnections,
  formatCountdown,
  groupCode,
  mcpConnectorUrl,
  mcpErrorKey,
  removeMcpConnection,
  requestMcpCode,
  secondsLeft,
  type McpCode,
  type McpConnection,
} from '@/mcp-connect';
import { requirePlus, useCloudStorageAllowed } from '@/plus';
import { colors, radius, space, ls } from '@/theme';

function errorText(e: unknown): string {
  const key = mcpErrorKey(e instanceof ApiError ? e.code : 'unknown');
  return key ? t(key) : communityErrorText(e);
}

/** How long a code lives on the server (`POST /v1/mcp/code`). */
const CODE_LIFE_MS = 5 * 60 * 1000;

export default function AiConnectScreen() {
  /* PLUS, OR A SERVER OF THEIR OWN — the rule cloud backup uses, because what
     the chatbot reads IS that backup. A self-hosted box that does not run the
     connector says `not_configured`, which has its own sentence. */
  const allowed = useCloudStorageAllowed();
  // STATE, read on focus: each is set by another screen this one sends you to.
  const [signedIn, setSignedIn] = useState(false);
  const [backupOn, setBackupOn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [connections, setConnections] = useState<McpConnection[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [code, setCode] = useState<McpCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);
  const url = mcpConnectorUrl();
  const ready = allowed && signedIn && backupOn;

  const refresh = useCallback(() => {
    const account = hasAccount();
    const backup = backupDestination() === 'opentv';
    setSignedIn(account);
    setBackupOn(backup);
    if (!account || !backup) return;
    setListError(null);
    void fetchMcpConnections()
      .then((list) => {
        setConnections(list);
        // A CODE WORKS ONCE (4 Nov). The connection it made is the proof it was
        // used, and showing it on after that sent people back to Claude with a
        // code the server had already spent. Gone as soon as its connection is.
        setCode((prev) => (prev && list.some((c) => Date.parse(c.createdAt) >= Date.parse(prev.expiresAt) - CODE_LIFE_MS - 5000) ? null : prev));
      })
      .catch((e: unknown) => {
        setConnections((prev) => prev ?? []);
        setListError(communityErrorText(e));
      });
  }, []);
  // ON FOCUS: the chatbot finishes connecting in a browser, and coming back
  // here is when the new row should be there.
  useFocusEffect(refresh);

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    // While a code is on screen, look for the connection it makes every few
    // seconds, so a code used in the browser disappears here by itself.
    const poll = setInterval(refresh, 5000);
    return () => {
      clearInterval(id);
      clearInterval(poll);
    };
  }, [code, refresh]);

  const left = code ? secondsLeft(code.expiresAt, now) : 0;

  const copy = (text: string, what: 'url' | 'code') => {
    void Clipboard.setStringAsync(text);
    tapLight();
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const getCode = async () => {
    if (busy) return;
    tapLight();
    setBusy(true);
    setCodeError(null);
    try {
      const c = await requestMcpCode();
      setNow(Date.now());
      setCode(c);
    } catch (e) {
      setCode(null);
      setCodeError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (c: McpConnection) => {
    Alert.alert(t('aiConnect.removeTitle', { name: c.client }), t('aiConnect.removeBody', { name: c.client }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => void doRemove(c) },
    ]);
  };

  /** Optimistic, like Your devices: gone on Remove, back if the server says no. */
  const doRemove = async (c: McpConnection) => {
    tapLight();
    setConnections((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    try {
      await removeMcpConnection(c.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') return;
      Alert.alert(t('cloudBackup.failedTitle'), communityErrorText(e));
    }
    refresh();
  };

  // The steps show once agreed, or straight away for somebody who already has
  // a connection — they agreed the first time, and the words are still above.
  const showSteps = agreed || (connections?.length ?? 0) > 0;

  return (
    <Screen>
      <NavHeader title={t('aiConnect.title')} close />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.intro}>{t('aiConnect.intro')}</Text>

        {!allowed ? (
          <Door body={t('aiConnect.plusBody')} label={t('aiConnect.getPlus')} trackId="aiConnect.getPlus"
            onPress={() => requirePlus('ai_connect')} />
        ) : !signedIn ? (
          <Door body={t('aiConnect.signInBody')} label={t('aiConnect.signIn')} trackId="aiConnect.signIn"
            onPress={() => router.push('/sign-in?next=/ai-connect')} />
        ) : !backupOn ? (
          <Door body={t('aiConnect.backupBody')} label={t('aiConnect.turnOnBackup')} trackId="aiConnect.turnOnBackup"
            onPress={() => router.push('/cloud-backup')} />
        ) : null}

        {ready && (
          <>
            <View style={styles.consent} accessible accessibilityRole="text">
              <Ionicons name="lock-closed-outline" size={16} color={colors.dim} />
              <Text style={styles.consentText}>{t('aiConnect.consent')}</Text>
            </View>

            {!showSteps ? (
              <View style={styles.doorButton}>
                <PillButton label={t('aiConnect.agree')} trackId="aiConnect.agree"
                  onPress={() => {
                    tapLight();
                    setAgreed(true);
                  }} />
              </View>
            ) : (
              <>
                <Text accessibilityRole="header" style={styles.step}>{t('aiConnect.step1')}</Text>
                <Text style={styles.body}>{t('aiConnect.step1Body')}</Text>
                <Pressable
                  onPress={() => copy(url, 'url')}
                  accessibilityRole="button"
                  accessibilityLabel={t('aiConnect.copy')}
                  accessibilityValue={{ text: url }}
                  style={styles.urlBox}>
                  {/* An address reads left to right in every language. */}
                  <Text style={styles.url} selectable numberOfLines={2}>{url}</Text>
                  <Ionicons name={copied === 'url' ? 'checkmark' : 'copy-outline'} size={20} color={copied === 'url' ? colors.green : colors.dim} />
                </Pressable>
                <Text style={styles.copyHint}>{copied === 'url' ? t('aiConnect.copied') : t('aiConnect.copy')}</Text>
                {/* Verified 4 Nov 2026 on both free plans. Their button names stay
                    in English inside the strings: that is how those apps show them.
                    Product names, not copy: nothing to translate. */}
                <Text style={styles.app}>{'Claude'}</Text>
                <Text style={styles.howTo}>{t('aiConnect.step1Claude')}</Text>
                <Text style={styles.app}>{'ChatGPT'}</Text>
                <Text style={styles.howTo}>{t('aiConnect.step1ChatGPT')}</Text>
                <Text
                  style={styles.link}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL('https://theopentv.com/claude').catch(() => {})}>
                  {t('aiConnect.fullGuide')}
                </Text>

                <Text accessibilityRole="header" style={styles.step}>{t('aiConnect.step2')}</Text>
                <Text style={styles.body}>{t('aiConnect.step2Body')}</Text>
                <View style={styles.codeBox}>
                  {code && left > 0 ? (
                    <>
                      <Pressable
                        onPress={() => copy(code.code, 'code')}
                        accessibilityRole="button"
                        accessibilityLabel={t('aiConnect.copyCode')}
                        // Spaced digit by digit so a screen reader spells it.
                        accessibilityValue={{ text: code.code.split('').join(' ') }}
                        hitSlop={10}
                        style={styles.codeRow}>
                        <Text style={styles.code} selectable>{groupCode(code.code)}</Text>
                        <Ionicons name={copied === 'code' ? 'checkmark' : 'copy-outline'} size={20} color={copied === 'code' ? colors.green : colors.dim} />
                      </Pressable>
                      <Text style={styles.countdown}>{t('aiConnect.expiresIn', { time: formatCountdown(left) })}</Text>
                      <Text style={styles.countdown}>{t('aiConnect.codeOnce')}</Text>
                    </>
                  ) : (
                    <>
                      {code && <Text style={styles.countdown}>{t('aiConnect.expired')}</Text>}
                      <PillButton
                        label={code ? t('aiConnect.newCode') : t('aiConnect.getCode')}
                        trackId={code ? 'aiConnect.newCode' : 'aiConnect.getCode'}
                        onPress={busy ? undefined : () => void getCode()}
                      />
                      {busy && <ActivityIndicator color={colors.dim} />}
                    </>
                  )}
                  {codeError != null && <Text style={styles.error}>{codeError}</Text>}
                </View>
              </>
            )}

            {listError != null && <ErrorBar message={listError} onDismiss={() => setListError(null)} onRefresh={refresh} />}
            {/* A handful at most — one per chatbot — so a plain map, not a list. */}
            {connections != null && connections.length > 0 && (
              <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>{t('aiConnect.connected')}</Text>
                {connections.map((c) => (
                  <ConnectionRow key={c.id} c={c} onRemove={() => remove(c)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Why this door is shut, and the one button that opens it. */
function Door({ body, label, trackId, onPress }: { body: string; label: string; trackId: string; onPress: () => void }) {
  return (
    <>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.doorButton}>
        <PillButton label={label} trackId={trackId} onPress={onPress} />
      </View>
    </>
  );
}

function ConnectionRow({ c, onRemove }: { c: McpConnection; onRemove: () => void }) {
  const added = t('aiConnect.addedOn', {
    date: new Date(c.createdAt).toLocaleDateString(intlTag(currentLocale()), { dateStyle: 'medium' }),
  });
  return (
    <View style={styles.row}>
      {/* THE WORDS ARE ONE ELEMENT, THE BUTTON ANOTHER, as on Your devices. */}
      <View style={{ flex: 1 }} accessible accessibilityRole="text" accessibilityLabel={`${c.client}. ${added}`}>
        <Text style={styles.name} numberOfLines={1}>{c.client}</Text>
        <Text style={styles.sub}>{added}</Text>
      </View>
      <Pressable hitSlop={8} onPress={onRemove} accessibilityRole="button" accessibilityLabel={t('aiConnect.removeA11y', { name: c.client })}>
        <Text style={styles.remove}>{t('common.remove')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: space.lg, paddingTop: 14 },
  body: { color: colors.dim, fontSize: 14, lineHeight: 20, paddingHorizontal: space.lg, paddingTop: 12 },
  doorButton: { paddingHorizontal: space.lg, paddingTop: 18, alignItems: 'flex-start' },
  consent: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: space.lg,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  consentText: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 },
  step: { color: colors.text, fontSize: 16, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: 24 },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: space.lg,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.card,
    backgroundColor: colors.card,
  },
  url: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1, writingDirection: 'ltr', textAlign: 'left' },
  copyHint: { color: colors.faint, fontSize: 12, paddingHorizontal: space.lg, paddingTop: 6 },
  app: { color: colors.text, fontSize: 14.5, fontWeight: '700', paddingHorizontal: space.lg, paddingTop: 16 },
  howTo: { color: colors.dim, fontSize: 14, lineHeight: 20, paddingHorizontal: space.lg, paddingTop: 4 },
  link: { color: colors.blue, fontSize: 14, fontWeight: '600', paddingHorizontal: space.lg, paddingTop: 14, alignSelf: 'flex-start' },
  codeBox: { margin: space.lg, padding: 20, borderRadius: radius.card, backgroundColor: colors.card, alignItems: 'center', gap: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Digits the reader types into a browser: Western, left to right, wide apart.
  code: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: ls(4), fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  countdown: { color: colors.dim, fontSize: 13.5, fontVariant: ['tabular-nums'] },
  error: { color: colors.danger, fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  sectionTitle: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: ls(1.2),
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    paddingTop: 22,
    paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 12 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
  sub: { color: colors.dim, fontSize: 13, marginTop: 2 },
  remove: { color: colors.danger, fontSize: 14, fontWeight: '700' },
});
