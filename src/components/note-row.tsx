/**
 * "My note" — one private note on a show, a film or an episode, and the
 * editor that writes it. The show, film and episode pages each drop one in.
 *
 * PRIMITIVE PROPS, NOT A TARGET OBJECT. A target built inline by the caller is
 * a new object every render, and the focus re-read below would either run on
 * every one of them or be memoised away by the React Compiler. Numbers and a
 * string compare by value.
 *
 * READ BACK INTO STATE, never read during render: the note can change behind
 * this screen (a backup restored), and a render-time read of the database is
 * exactly what the compiler caches into staleness. State React sets survives.
 *
 * Nothing here is tracked — the row is not a MenuRow on purpose, so not even
 * the shape of a tap on it reaches analytics.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PromptModal } from '@/components/prompt-modal';
import { getNote, setNote, type NoteTarget } from '@/db';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { NOTE_MAX_LENGTH } from '@/notes-pure';
import { colors, space } from '@/theme';

export function NoteRow({
  showId,
  season,
  episode,
  movie,
  inset = true,
}: {
  /** A show (alone) or an episode (with season and episode). */
  showId?: number;
  season?: number;
  episode?: number;
  /** A film, by its library name — the key every per-film row uses. */
  movie?: string;
  /** False inside a card that already has its own padding. */
  inset?: boolean;
}) {
  const target = useCallback((): NoteTarget | null => {
    if (movie) return { kind: 'movie', movie };
    if (!showId) return null;
    return season != null && episode != null ? { kind: 'episode', showId, season, episode } : { kind: 'show', showId };
  }, [showId, season, episode, movie]);

  const [note, setNoteText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      const tg = target();
      setNoteText(tg ? getNote(tg) : null);
    }, [target, setNoteText]),
  );

  if (!target()) return null;
  return (
    <>
      <Pressable
        style={[styles.row, !inset && { paddingHorizontal: 0 }]}
        accessibilityRole="button"
        accessibilityLabel={note ? `${t('privateNotes.title')}, ${note}` : t('privateNotes.add')}
        accessibilityHint={t('privateNotes.private')}
        onPress={() => {
          tapLight();
          setEditing(true);
        }}>
        <Ionicons name={note ? 'document-text-outline' : 'create-outline'} size={20} color={colors.dim} style={styles.icon} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('privateNotes.title')}</Text>
          <Text style={note ? styles.note : styles.empty}>{note ?? t('privateNotes.add')}</Text>
        </View>
        <Ionicons name="lock-closed-outline" size={14} color={colors.faint} />
      </Pressable>
      <PromptModal
        visible={editing}
        title={t('privateNotes.title')}
        hint={t('privateNotes.private')}
        initial={note ?? ''}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        onCancel={() => setEditing(false)}
        onSubmit={(v) => {
          const tg = target();
          try {
            // read back what was stored, never assume the write landed
            if (tg) setNoteText(setNote(tg, v));
          } catch {
            // a failed write leaves the old note showing, which is the truth
          }
          setEditing(false);
          return true;
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: space.lg, paddingVertical: 14 },
  icon: { marginTop: 1 },
  title: { color: colors.text, fontSize: 15.5 },
  // `textAlign: 'auto'` is the platform's natural alignment, which mirrors in
  // Arabic; a fixed 'left' would not
  note: { color: colors.dim, fontSize: 14.5, lineHeight: 20, marginTop: 3, textAlign: 'auto' },
  empty: { color: colors.faint, fontSize: 13.5, marginTop: 3 },
});
