import { cookies } from "next/headers";
import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/session";
import { UserSession } from "@/app/types";

export async function getServerSession(): Promise<UserSession> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionCookie(raw);
}
