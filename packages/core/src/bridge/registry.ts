/**
 * Bridge adapter registry.
 *
 * Adding support for a new agent means adding one adapter module here; every
 * generic layer (install/uninstall, ingestion, stats, UI) iterates this list and
 * never references a specific agent.
 */
import type { BridgeAdapter } from '../types.js';
import { opencodeBridge } from './adapters/opencode/index.js';

export const BRIDGE_ADAPTERS: readonly BridgeAdapter[] = [opencodeBridge];

export function listBridgeAdapters(): readonly BridgeAdapter[] {
  return BRIDGE_ADAPTERS;
}

export function getBridgeAdapter(id: string): BridgeAdapter | undefined {
  return BRIDGE_ADAPTERS.find((adapter) => adapter.id === id);
}
