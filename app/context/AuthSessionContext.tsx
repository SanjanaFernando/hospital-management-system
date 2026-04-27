"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";
import { UserSession } from "@/app/types";
import { normalizeSession } from "@/lib/rbac";

interface AuthSessionContextValue {
  session: UserSession;
  setSession: (session: UserSession) => void;
}

const STORAGE_KEY = "hospital-rbac-session";

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
  undefined
);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<UserSession>(() => {
    if (typeof window === "undefined") {
      return normalizeSession({ role: "admin", displayName: "System Admin" });
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return normalizeSession({ role: "admin", displayName: "System Admin" });
      }

      const parsed = JSON.parse(raw) as Partial<UserSession>;
      return normalizeSession(parsed);
    } catch {
      return normalizeSession({ role: "admin", displayName: "System Admin" });
    }
  });

  const setSession = (nextSession: UserSession) => {
    const normalized = normalizeSession(nextSession);
    setSessionState(normalized);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  };

  const value = useMemo(() => ({ session, setSession }), [session]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }

  return context;
}
