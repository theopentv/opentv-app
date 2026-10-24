/**
 * Choose a poster from your own library for an Artwork widget.
 *
 * A GRID OF PICTURES, NOT A LIST OF TITLES. The thing being chosen is an image
 * and the only question is which one looks right on the profile — a list of
 * names would make somebody pick blind and then go back and look.
 *
 * Nothing is created if this screen is left without choosing: an empty Artwork
 * widget would be a hole on the grid that has to be filled or removed, which is
 * the feature asking for work rather than doing any.
 */

import { router, useLocalSearchParams } from 'expo-router';

import { TitlePicker } from '@/components/title-picker';
import { NavHeader, Screen } from '@/components/ui';
import { getProfileLayout, setProfileLayout } from '@/db';
import { tapLight } from '@/haptics';
import { t } from '@/i18n';
import {
  newUid,
  normalise,
  notifyLayoutSaved,
  parseLayout,
  serialise,
  specOf,
  type WidgetSpan,
} from '@/profile-layout';

export default function PickArtworkScreen() {
  /** The size chosen in the preview before getting here. */
  const { span, uid } = useLocalSearchParams<{ span?: string; uid?: string }>();
  const chosen: WidgetSpan = span === '2x1' || span === '2x2' ? span : specOf('artwork').span;


  const choose = (ref: string) => {
    tapLight();
    const raw = getProfileLayout();
    const items = normalise(parseLayout(raw), []);
    // At the end, where somebody can see it arrive.
    /*
     * REPLACE WHEN A `uid` CAME WITH US, ADD WHEN IT DID NOT.
     *
     * This screen only ever appended, so the pencil on an existing widget
     * would have left the old one behind and put a second beside it. The uid
     * is the whole difference between "change this" and "add another".
     */
    const next = uid
      ? items.map((i) => (i.uid === uid ? { ...i, span: chosen, data: ref } : i))
      : [...items, { uid: newUid('artwork'), id: 'artwork', span: chosen, data: ref }];
    setProfileLayout(serialise(next, raw));
    // The Profile tab is under a transparent modal here and never blurred, so
    // its focus effect will not fire. See `notifyLayoutSaved`.
    notifyLayoutSaved();
    router.back();
  };

  return (
    <Screen>
      {/* The native header: its back button is one iOS can move into the
          iPhone Duo's strip, which a drawn chevron never is. */}
      <NavHeader title={t('pickArtwork.title')} />

      {/* The same grid the GIF picker's first step draws — one component, so
          the two flows cannot drift apart. */}
      <TitlePicker onPick={(c) => choose(c.key)} />
    </Screen>
  );
}

