/**
 * The right half of a list on an open iPhone Duo: empty until a show is tapped
 * (decided 29 Oct), then the show page itself. The left half keeps its place.
 * Keyed by show, so one page's tabs and scroll do not carry into the next.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import ShowScreen from '@/app/show/[id]';
import { DetailPaneContext } from '@/components/ui';

export function ShowPane({ id, width, onClose }: { id: number | null; width: number; onClose: () => void }) {
  const pane = useMemo(() => (id == null ? null : { id: String(id), width, close: onClose }), [id, width, onClose]);
  return (
    <View style={[s.pane, { width }]}>
      {pane && (
        <DetailPaneContext.Provider value={pane}>
          <ShowScreen key={pane.id} />
        </DetailPaneContext.Provider>
      )}
    </View>
  );
}

// The band either side of the fold: nothing of the page sits in it.
const s = StyleSheet.create({ pane: { overflow: 'hidden', marginStart: 28 } });
