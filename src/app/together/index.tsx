/**
 * Watching together — its OWN screen (22 Oct). It used to be a second group
 * under "Shared with friends" on the Lists page, which made a together read as
 * a kind of list. Only togethers live here; ordinary shared lists stay on Lists.
 *
 * Both doors sit at the top and stay there when the screen is empty: almost
 * everybody arriving has none yet, and half of them were sent a code.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';

import { ApiError } from '@/api';
import { communityErrorText } from '@/community-error-text';
import { isJoined, useJoined } from '@/community-session';
import { fetchSharedLists, joinSharedList, type SharedListRow } from '@/community-shared-lists';
import { noteTogetherIndex, noteTogetherJoined, publishPositions } from '@/community-together';
import { ListCollage } from '@/components/list-collage';
import { Text } from '@/components/text';
import { NavHeader, PillButton, Screen } from '@/components/ui';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { requirePlus, usePlus } from '@/plus';
import { inviteCodeFrom, splitShared, TABLET_MIN_W } from '@/pure';
import { colors, ls, radius, space } from '@/theme';

// Same band geometry as the Lists page, so a together looks the same in both.
const tileCols = (w: number) => (w >= TABLET_MIN_W ? 8 : 4);
const tileWidth = (w: number) => (w - 2 * 12 - (tileCols(w) - 1) * 2) / tileCols(w);

export default function TogetherScreen() {
  // `?join=1` (from the profile ••• menu): the code box is the reason they came.
  const { join: focusJoin } = useLocalSearchParams<{ join?: string }>();
  const { width } = useWindowDimensions();
  const joined = useJoined();
  const plus = usePlus();
  const [rows, setRows] = useState<SharedListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!joined) {
      setRows([]);
      return;
    }
    try {
      const all = await fetchSharedLists();
      noteTogetherIndex(all);
      setRows(splitShared(all).togethers);
      setError(null);
    } catch (e) {
      setError(communityErrorText(e));
      setRows((r) => r ?? []);
    }
  }, [joined]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // A focus does not fire for a screen already open (21 Oct).
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') void load();
      });
      return () => sub.remove();
    }, [load]),
  );

  const start = () => {
    if (!isJoined()) router.push('/join');
    // The same gate `startTogether` applies, asked BEFORE the picker so nobody
    // chooses a show only to meet a paywall.
    else if (requirePlus('together')) router.push('/lists/add-remove?together=1');
  };

  // The same join `shared/index.tsx` does; a pasted link works too.
  const join = async () => {
    const c = inviteCodeFrom(code);
    if (c.length === 0 || joining) return;
    if (!isJoined()) {
      router.push('/join');
      return;
    }
    setJoining(true);
    try {
      const res = await joinSharedList(c);
      if (res.kind === 'together') noteTogetherJoined();
      tapLight();
      setCode('');
      await load();
      // The joiner's own position goes up before the screen opens (14 Oct).
      if (res.kind === 'together') await publishPositions();
      router.push(`/shared/${encodeURIComponent(res.id)}`);
    } catch (e) {
      Alert.alert(t('shared.joinFailedTitle'), e instanceof ApiError && e.code === 'not_found' ? t('shared.joinNoList') : communityErrorText(e));
    } finally {
      setJoining(false);
    }
  };

  const header = (
    <View style={styles.head}>
      {rows != null && rows.length === 0 && <Text style={styles.blurb}>{t('together.emptyBlurb')}</Text>}
      <View style={{ alignItems: 'center' }}>
        <PillButton label={plus ? t('together.pickStart') : t('together.pickStartPlus')} trackId="together_start" onPress={start} />
      </View>
      <Text style={styles.label}>{t('listsIndex.joinWithCode')}</Text>
      <View style={styles.codeRow}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={t('shared.codePlaceholder')}
          accessibilityLabel={t('listsIndex.joinWithCode')}
          placeholderTextColor={colors.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={focusJoin === '1'}
          style={styles.codeInput}
          onSubmitEditing={() => void join()}
          returnKeyType="go"
        />
        <Pressable
          accessibilityRole="button"
          style={[styles.codeGo, code.trim().length === 0 && { opacity: 0.4 }]}
          disabled={code.trim().length === 0 || joining}
          onPress={() => void join()}>
          {joining ? <ActivityIndicator size="small" color={colors.onYellow} /> : <Text style={styles.codeGoText}>{t('shared.joinAction')}</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <Screen>
      <NavHeader title={t('together.title')} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 60, gap: 12 }}
        refreshControl={
          joined ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={colors.dim}
            />
          ) : undefined
        }
        ListHeaderComponent={header}
        ListEmptyComponent={rows == null && joined ? <ActivityIndicator color={colors.yellow} style={{ marginTop: 20 }} /> : undefined}
        renderItem={({ item }) => (
          <ListCollage
            list={{
              name: item.show?.title ?? item.name,
              items: (item.posters ?? []).map((poster) => ({ name: '', poster })),
              shared: true,
              together: true,
              memberCount: item.members,
            }}
            cols={tileCols(width)}
            tileW={tileWidth(width)}
            onPress={() => router.push(`/shared/${encodeURIComponent(item.id)}`)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 14, gap: 10, marginBottom: 8 },
  blurb: { color: colors.dim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 8 },
  label: { color: colors.dim, fontSize: 12, letterSpacing: ls(0.6), textTransform: 'uppercase', fontWeight: '700', marginTop: 10 },
  codeRow: { flexDirection: 'row', gap: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: 16,
    letterSpacing: ls(2),
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeGo: {
    backgroundColor: colors.yellow,
    borderRadius: radius.card,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  codeGoText: { color: colors.onYellow, fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13.5, textAlign: 'center', marginTop: space.sm },
});
