/**
 * Agent bridge install status. Used to tell whether runtime monitoring has ever
 * been configured (e.g. to offer a setup shortcut from the activity view).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeStatus } from '@skillcat/core';
import type { SkillCatApi } from '@shared/contract';

export interface BridgesController {
  bridges: BridgeStatus[];
  reload: () => Promise<void>;
}

export function useBridges(api: SkillCatApi): BridgesController {
  const [bridges, setBridges] = useState<BridgeStatus[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await api.listBridges();
    if (mounted.current) setBridges(next);
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { bridges, reload };
}
