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
import { SESSION_COOKIE_NAME, stringifySessionCookie } from "@/lib/session";

interface AuthSessionContextValue {
  session: UserSession;
  setSession: (session: UserSession) => void;
}

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(
  undefined
);

export function AuthSessionProvider({
  children,
  initialSession,
}: PropsWithChildren & { initialSession?: UserSession }) {
  const [session, setSessionState] = useState<UserSession>(() =>
    normalizeSession(initialSession)
  );

  const setSession = (nextSession: UserSession) => {
    const normalized = normalizeSession(nextSession);
    setSessionState(normalized);
    document.cookie = `${SESSION_COOKIE_NAME}=${stringifySessionCookie(normalized)}; path=/; max-age=31536000; samesite=lax`;
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
