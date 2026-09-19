import React, { createContext, useContext, useEffect, useState } from 'react';
import type { SkillCatApi, Snapshot } from '@shared/contract';

const ApiContext = createContext<SkillCatApi | null>(null);

export function ApiProvider({
  api,
  children,
}: {
  api: SkillCatApi;
  children: React.ReactNode;
}): React.ReactElement {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): SkillCatApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('SkillCatApi is not available');
  return api;
}

export function useSnapshot(): Snapshot | null {
  const api = useApi();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let active = true;
    void api.getSnapshot().then((value) => {
      if (active) setSnapshot(value);
    });
    const unsubscribe = api.onStateChanged((value) => setSnapshot(value));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  return snapshot;
}

export function useStatus(): {
  status: string | null;
  showStatus: (message: string) => void;
  showError: (message: string) => void;
} {
  const [status, setStatus] = useState<string | null>(null);
  const showStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus((current) => (current === message ? null : current)), 5000);
  };
  return { status, showStatus, showError: showStatus };
}
