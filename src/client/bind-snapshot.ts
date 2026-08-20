/**
 * uSES bridge for settings-scope snapshots. In-tree plugins bind through
 * ui-renderer; out-of-tree bundles inline this copy so they never import the
 * retired web-react platform package.
 */
import { useRef, useSyncExternalStore } from 'react'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'

function useStoreSelector<Snapshot, Selection>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  selector: (snapshot: Snapshot) => Selection,
  isEqual: (a: Selection, b: Selection) => boolean,
): Selection {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const selected = selector(snapshot)
  const cached = useRef(selected)
  if (!isEqual(cached.current, selected)) cached.current = selected
  return cached.current
}

/** Bind a bare observable source to a typed uSES selector hook. */
export function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  const subscribe = (fn: () => void) => source.subscribe(fn)
  const getSnapshot = () => source.getSnapshot()
  return function useSelector<S>(sel: (s: T) => S, eq?: (a: S, b: S) => boolean): S {
    return useStoreSelector(subscribe, getSnapshot, sel, eq ?? Object.is)
  }
}
