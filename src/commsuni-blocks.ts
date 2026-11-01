/**
 * BLOCK AUTHOR on the shared board (Partner Terms §A11.4, guide "Blocking
 * authors"). A member hides one CommsUni author everywhere in OpenTV. The list
 * lives on our server so it follows them to every device, with a copy in
 * `meta` so a page filters before the network answers. Never a report, and
 * never sent to CommsUni: it changes what this member sees, nothing else.
 */
import { useSyncExternalStore } from 'react';

import { getToken, isJoined } from '@/community-session';
import { getMeta, setMeta } from '@/db';
import { serverUrl } from '@/server-url';

export type BlockedAuthor = { id: string; name: string | null };

const KEY = 'commsuniBlocks';
let list: BlockedAuthor[] = read();
const listeners = new Set<() => void>();

function read(): BlockedAuthor[] {
  try {
    const v = JSON.parse(getMeta(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as BlockedAuthor[]).filter((b) => typeof b?.id === 'string') : [];
  } catch {
    return [];
  }
}

function set(next: BlockedAuthor[]) {
  list = next;
  setMeta(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export const isBlockedAuthor = (id: string | null | undefined): boolean => id != null && list.some((b) => b.id === id);

/** Drop blocked authors' rows; keeps the input when nothing is blocked. */
export function withoutBlocked<T extends { author: { id?: string | null } }>(rows: T[]): T[] {
  return list.length ? rows.filter((r) => !isBlockedAuthor(r.author.id)) : rows;
}

/** The list, as React state: a screen re-renders when a block changes it. */
export function useBlockedAuthors(): BlockedAuthor[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => list,
  );
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!isJoined()) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    return await fetch(`${serverUrl()}/v1/commsuni/blocks${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    return null;
  }
}

/** The server's list replaces the local copy: another device may have changed it. */
export async function refreshBlockedAuthors(): Promise<void> {
  const res = await call('');
  if (!res?.ok) return;
  const got = (await res.json().catch(() => null)) as { blocks?: BlockedAuthor[] } | null;
  if (Array.isArray(got?.blocks)) set(got.blocks.map((b) => ({ id: b.id, name: b.name ?? null })));
}

/** Hides at once, then tells the server; a failed save is taken back. */
export async function blockAuthor(id: string, name: string | null): Promise<boolean> {
  if (isBlockedAuthor(id)) return true;
  const before = list;
  set([{ id, name }, ...list]);
  const res = await call('', { method: 'POST', body: JSON.stringify({ id, name }) });
  if (res?.ok) return true;
  set(before);
  return false;
}

export async function unblockAuthor(id: string): Promise<boolean> {
  const before = list;
  set(list.filter((b) => b.id !== id));
  const res = await call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res?.ok) return true;
  set(before);
  return false;
}
