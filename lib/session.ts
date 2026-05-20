import { normalizeSession } from "@/lib/rbac";
import { UserSession } from "@/app/types";

export const SESSION_COOKIE_NAME = "hospital-rbac-session";

export function parseSessionCookie(raw?: string | null): UserSession {
  if (!raw) {
    return normalizeSession(null);
  }

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<UserSession>;
    return normalizeSession(parsed);
  } catch {
    return normalizeSession(null);
  }
}

export function stringifySessionCookie(session: UserSession): string {
  return encodeURIComponent(JSON.stringify(normalizeSession(session)));
}
