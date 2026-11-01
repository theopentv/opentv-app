/**
 * The iPhone Duo hinge: 'closed', 'partial' (half open, book), 'open' (flat)
 * or 'unknown' (no hinge, or a binary built before this module). Optional, so
 * every other device and an older dev client read 'unknown' and nothing breaks.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';

export type HingeStatus = 'closed' | 'partial' | 'open' | 'unknown';

type FoldStateModule = {
  getStatus(): HingeStatus;
  addListener(event: 'onChange', cb: (e: { status: HingeStatus }) => void): { remove(): void };
};

const native = requireOptionalNativeModule<FoldStateModule>('FoldState');

export function useHingeStatus(): HingeStatus {
  const [status, setStatus] = useState<HingeStatus>(() => native?.getStatus() ?? 'unknown');
  useEffect(() => {
    const sub = native?.addListener('onChange', (e) => setStatus(e.status));
    return () => sub?.remove();
  }, []);
  return status;
}
