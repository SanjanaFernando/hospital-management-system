"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
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
  const [session, setSessionState] = useState<UserSession>(() =>
    normalizeSession({ role: "admin", displayName: "System Admin" })
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<UserSession>;
      setSessionState(normalizeSession(parsed));
    } catch {
      // Ignore malformed persisted session and keep default.
    }
  }, []);

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
