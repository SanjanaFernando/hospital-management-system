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
import { logoutUser } from "@/app/actions/userActions";

interface AuthSessionContextValue {
  session: UserSession;
  setSession: (session: UserSession) => void;
  logout: () => Promise<void>;
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
  };

  const logout = async () => {
    await logoutUser();
    // Force full page reload to trigger middleware redirect to /login
    window.location.href = "/login";
  };

  const value = useMemo(
    () => ({ session, setSession, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session]
  );

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
