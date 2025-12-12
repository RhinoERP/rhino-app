"use client";

import { createContext, useContext, useMemo } from "react";

type PermissionsContextValue = {
  orgSlug: string;
  permissions: string[];
  can: (perm: string) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

type PermissionsProviderProps = {
  orgSlug: string;
  initialPermissions: string[];
  children: React.ReactNode;
};

export function PermissionsProvider({
  orgSlug,
  initialPermissions,
  children,
}: PermissionsProviderProps) {
  const value = useMemo<PermissionsContextValue>(
    () => ({
      orgSlug,
      permissions: initialPermissions,
      can: (perm: string) => initialPermissions.includes(perm),
    }),
    [orgSlug, initialPermissions]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within PermissionsProvider");
  }
  return ctx;
}
