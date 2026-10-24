/**
 * Pick a GIF for a GIF widget. The searching lives in `GifSearch`, shared with
 * the banner picker; this screen only decides what happens to the file.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { GifSearch, saveGif, type GifHit } from '@/components/gif-search';
import { NavHeader, Screen } from '@/components/ui';
import { getProfileLayout, setProfileLayout } from '@/db';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import { newUid, normalise, notifyLayoutSaved, parseLayout, serialise, specOf, type WidgetSpan } from '@/profile-layout';

export default function PickGifScreen() {
  const { span, uid } = useLocalSearchParams<{ span?: string; uid?: string }>();
  const chosen: WidgetSpan = span === '2x1' || span === '2x2' ? span : specOf('gif').span;
  const [saving, setSaving] = useState<string | null>(null);

  const choose = async (hit: GifHit) => {
    if (saving) return;
    setSaving(hit.id);
    try {
      const name = await saveGif(hit, 'widget-gif');
      tapLight();
      const raw = getProfileLayout();
      const items = normalise(parseLayout(raw), []);
      // Same rule as the artwork picker: a uid means replace, its absence
      // means add. Without it the pencil would leave the old GIF in place.
      const next = uid
        ? items.map((i) => (i.uid === uid ? { ...i, span: chosen, data: name } : i))
        : [...items, { uid: newUid('gif'), id: 'gif', span: chosen, data: name }];
      setProfileLayout(serialise(next, raw));
      notifyLayoutSaved();
      router.back();
    } catch (err) {
      Alert.alert(t('pickGif.failedTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen>
      {/* The native header: its back button is one iOS can move into the
          iPhone Duo's strip, which a drawn chevron never is. */}
      <NavHeader title={t('pickGif.title')} />
      <GifSearch onPick={(h) => void choose(h)} busyId={saving} />
    </Screen>
  );
}
