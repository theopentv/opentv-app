/**
 * Cross-platform text prompt. Replaces Alert.prompt, which is iOS-only — on
 * Android it silently does nothing, so profile fields (name, birth year,
 * country) could not be edited there at all. A plain Modal + TextInput works on
 * both.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, space } from '@/theme';
import { t } from '@/i18n';

export function PromptModal({
  visible,
  title,
  initial,
  keyboardType = 'default',
  multiline = false,
  maxLength,
  hint,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initial: string;
  keyboardType?: 'default' | 'number-pad';
  /** A paragraph rather than a field — Return adds a line instead of saving,
   *  so only the Save button saves (private notes). */
  multiline?: boolean;
  maxLength?: number;
  /** One quiet line under the title, e.g. "Only on this phone". */
  hint?: string;
  /** return true if the value was accepted (modal closes); false keeps it open */
  onSubmit: (value: string) => boolean;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  // refill with the current value every time it reopens for a different field
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.center} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType={keyboardType}
            accessibilityLabel={title}
            autoFocus
            selectTextOnFocus={!multiline}
            multiline={multiline}
            maxLength={maxLength}
            style={[styles.input, multiline && styles.multiline]}
            placeholderTextColor={colors.faint}
            returnKeyType={multiline ? 'default' : 'done'}
            onSubmitEditing={multiline ? undefined : () => onSubmit(text)}
          />
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={onCancel} hitSlop={6} accessibilityRole="button">
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => onSubmit(text)} hitSlop={6} accessibilityRole="button">
              <Text style={styles.save}>{t('promptModal.save')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: space.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 14, padding: space.lg },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 14 },
  input: {
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // `textAlign: 'auto'` follows the layout direction, so a note starts at the
  // right edge in Arabic; Android needs `textAlignVertical` or it centres.
  multiline: { minHeight: 120, maxHeight: 260, textAlignVertical: 'top', textAlign: 'auto' },
  hint: { color: colors.dim, fontSize: 13, marginTop: -8, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
  cancel: { color: colors.dim, fontSize: 15, fontWeight: '600' },
  save: { color: colors.yellow, fontSize: 15, fontWeight: '800' },
});
