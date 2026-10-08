"use client";

import { createContext, useContext, useMemo, useState } from "react";

type SaveGuard = { blocked: boolean; setBlocked: (blocked: boolean) => void };
const DataCardSaveGuardContext = createContext<SaveGuard>({ blocked: false, setBlocked: () => undefined });

export function DataCardSaveGuardProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const value = useMemo(() => ({ blocked, setBlocked }), [blocked]);
  return <DataCardSaveGuardContext.Provider value={value}>{children}</DataCardSaveGuardContext.Provider>;
}

export function useDataCardSaveGuard() {
  return useContext(DataCardSaveGuardContext);
}
