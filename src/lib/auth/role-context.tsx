import { createContext, useContext, type ReactNode } from "react";
import type { HubRole } from "./authorization.functions";

type HubIdentity = {
  userId: string;
  email: string;
  role: HubRole;
};

const HubIdentityContext = createContext<HubIdentity | null>(null);

export function HubIdentityProvider({
  value,
  children,
}: {
  value: HubIdentity;
  children: ReactNode;
}) {
  return <HubIdentityContext.Provider value={value}>{children}</HubIdentityContext.Provider>;
}

export function useHubIdentity(): HubIdentity {
  const v = useContext(HubIdentityContext);
  if (!v) throw new Error("useHubIdentity must be used inside HubIdentityProvider");
  return v;
}

export function useHubIdentityOptional(): HubIdentity | null {
  return useContext(HubIdentityContext);
}

export function useHubRole(): HubRole {
  return useHubIdentity().role;
}

export function useCanWrite(): boolean {
  const role = useHubIdentityOptional()?.role;
  return role === "admin" || role === "programmer";
}

export function useIsAdmin(): boolean {
  return useHubIdentityOptional()?.role === "admin";
}