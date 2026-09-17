/**
 * Sidecar storage shapes written next to the config file: the scan-state hash
 * snapshot and the human trigger annotations. Neither ever touches skill dirs.
 */

/** Content hashes from the previous scan, used to detect drift. */
export interface ScanState {
  hashes: Record<string, string>;
}

export interface Annotation {
  added: Array<{ text: string; kind: 'positive' | 'negative' }>;
  removed: string[];
  note?: string;
}

/** Keyed by `annotationKey(record)` — scope|project|name|contentHash. */
export type AnnotationsFile = Record<string, Annotation>;
