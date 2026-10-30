/**
 * Whether the library's episode data is being fetched right now, and how far
 * along. `show-meta-fetch.ts` writes it; the bar above the tabs, the poster
 * progress and the Shows tab read it. On its own so `show-status.ts` can ask
 * without importing the fetcher.
 */
import { useSyncExternalStore } from 'react';

export type MetaFill = { done: number; total: number } | null;

let fill: MetaFill = null;
const listeners = new Set<() => void>();

export function setMetaFill(next: MetaFill): void {
  fill = next;
  listeners.forEach((l) => l());
}

export const metaFillRunning = (): boolean => fill != null;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useMetaFill = (): MetaFill => useSyncExternalStore(subscribe, () => fill);
export const useMetaFillRunning = (): boolean => useSyncExternalStore(subscribe, metaFillRunning);
