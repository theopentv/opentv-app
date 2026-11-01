/**
 * Two panes or one, on an open iPhone Duo (Settings → App). Two by default; the
 * switch is for somebody who would rather have the whole width. A store, not a
 * read in render: the Shows tab is already mounted when the switch is flipped.
 */
import { useSyncExternalStore } from 'react';

import { getMeta, setMeta } from '@/db';

const KEY = 'duoFullWidth';
const listeners = new Set<() => void>();

const read = () => getMeta(KEY) === '1';

export function setDuoFullWidth(on: boolean): void {
  setMeta(KEY, on ? '1' : '');
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useDuoFullWidth = (): boolean => useSyncExternalStore(subscribe, read);
