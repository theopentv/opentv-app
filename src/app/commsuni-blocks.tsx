/**
 * Blocked CommsUni authors, to review and undo (Partner Terms §A11.4). Read
 * from the server on open, so a block made on another device is here too.
 */
import { useEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text } from 'react-native';

import { refreshBlockedAuthors, unblockAuthor, useBlockedAuthors } from '@/commsuni-blocks';
import { EmptyState, MenuRow, NavHeader, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { colors, space } from '@/theme';

export default function CommsuniBlocksScreen() {
  const blocked = useBlockedAuthors();
  useEffect(() => {
    void refreshBlockedAuthors();
  }, []);
  return (
    <Screen>
      <NavHeader title={t('commsuni.block.listTitle')} />
      <FlatList
        data={blocked}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingBottom: space.xl }}
        ListHeaderComponent={<Text style={s.note}>{t('commsuni.block.listNote')}</Text>}
        ListEmptyComponent={<EmptyState title={t('commsuni.block.listEmpty')} />}
        renderItem={({ item }) => (
          <MenuRow
            trackId="commsuni.block.unblock"
            title={item.name ?? t('commsuni.block.someone')}
            right={
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  void unblockAuthor(item.id).then((ok) => {
                    if (!ok) Alert.alert(t('commsuni.block.failed'));
                  })
                }>
                <Text style={s.unblock}>{t('commsuni.block.unblock')}</Text>
              </Pressable>
            }
          />
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  note: { color: colors.dim, fontSize: 13, lineHeight: 18, paddingHorizontal: space.lg, paddingVertical: space.md },
  unblock: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
