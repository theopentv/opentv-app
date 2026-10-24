/**
 * React Native 0.88 removed `InteractionManager`; its replacement is
 * `requestIdleCallback`. Same shape as the old `runAfterInteractions`, so the
 * callers keep their `task.cancel()` cleanup.
 */
export function runAfterInteractions(fn: () => void): { cancel: () => void } {
  const id = requestIdleCallback(() => fn());
  return { cancel: () => cancelIdleCallback(id) };
}
