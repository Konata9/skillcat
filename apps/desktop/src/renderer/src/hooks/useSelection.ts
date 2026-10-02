import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a master-detail selection valid as the item list changes: clears it
 * when the list empties, falls back to `pinnedKey` (e.g. an overview) or the
 * first item when the current selection disappears.
 */
export function useSelection<T>({
  items,
  getKey,
  pinnedKey = null,
  emptyKey = null,
}: {
  items: T[];
  getKey: (item: T) => string;
  /** Key that stays valid even when absent from `items`. */
  pinnedKey?: string | null;
  /** Key used when `items` is empty. */
  emptyKey?: string | null;
}): {
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  selected: T | null;
} {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;

  useEffect(() => {
    if (items.length === 0) {
      setSelectedKey(emptyKey);
      return;
    }
    if (selectedKey === null) {
      setSelectedKey(pinnedKey ?? getKeyRef.current(items[0]!));
      return;
    }
    if (selectedKey === pinnedKey) return;
    if (!items.some((item) => getKeyRef.current(item) === selectedKey)) {
      setSelectedKey(getKeyRef.current(items[0]!));
    }
  }, [items, selectedKey, pinnedKey, emptyKey]);

  const selected =
    selectedKey === null ? null : (items.find((item) => getKey(item) === selectedKey) ?? null);

  return { selectedKey, setSelectedKey, selected };
}
