import { cookies } from "next/headers";
import { UserSession, StaffRole } from "@/app/types";
import { verifySessionToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/session";

export async function getServerSession(): Promise<UserSession> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    // Not authenticated — return a minimal unauthenticated session
    return { role: "guest", displayName: "Guest" };
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return { role: "guest", displayName: "Guest" };
  }

  const wardIds = Array.isArray(payload.wardIds) 
    ? payload.wardIds 
    : (payload.wardId ? [payload.wardId] : []);

  return {
    userId: payload.userId,
    role: payload.role as StaffRole,
    wardId: payload.wardId,
    wardIds: wardIds as string[],
    displayName: payload.displayName,
  };
}
