import { StaffRole, UserSession } from "@/app/types";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  consultant_doctor: "Consultant Doctor",
  main_sister: "Main Sister",
  main_attendant: "Main Attendant",
};

const WARD_LETTER_TO_INDEX: Record<string, string> = {
  a: "0",
  b: "1",
  c: "2",
  d: "3",
};

export function normalizeWardId(wardId?: string): string | undefined {
  if (!wardId) {
    return undefined;
  }

  const value = wardId.trim().toLowerCase();

  const byNumber = value.match(/^ward[-_\s]?([0-9]+)$/);
  if (byNumber) {
    return `ward-${byNumber[1]}`;
  }

  const byLetter = value.match(/^ward[-_\s]?([a-z])$/);
  if (byLetter) {
    const index = WARD_LETTER_TO_INDEX[byLetter[1]];
    if (index !== undefined) {
      return `ward-${index}`;
    }
  }

  return value;
}

export function normalizeSession(
  input?: Partial<UserSession> | null
): UserSession {
  if (!input?.role) {
    return { role: "admin", displayName: "System Admin" };
  }

  const role = input.role;
  if (role === "admin") {
    return {
      role,
      displayName: input.displayName || ROLE_LABELS[role],
    };
  }

  return {
    role,
    wardId: normalizeWardId(input.wardId),
    displayName: input.displayName || ROLE_LABELS[role],
  };
}

export function canAccessWard(session: UserSession, wardId: string): boolean {
  if (session.role === "admin") {
    return true;
  }

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);

  return Boolean(sessionWardId) && Boolean(targetWardId) && sessionWardId === targetWardId;
}

export function canManageStaff(session: UserSession): boolean {
  return session.role === "admin";
}

export function canManageWardActions(
  session: UserSession,
  wardId: string
): boolean {
  if (!canAccessWard(session, wardId)) {
    return false;
  }

  return (
    session.role === "admin" ||
    session.role === "consultant_doctor" ||
    session.role === "main_sister"
  );
}

export function canUpdateBedStatus(
  session: UserSession,
  wardId: string
): boolean {
  if (!canAccessWard(session, wardId)) {
    return false;
  }

  return (
    session.role === "admin" ||
    session.role === "consultant_doctor" ||
    session.role === "main_sister" ||
    session.role === "main_attendant"
  );
}

export function canAssignOrDischargePatient(
  session: UserSession,
  wardId: string
): boolean {
  return canManageWardActions(session, wardId);
}

export function canRegisterPatient(
  session: UserSession,
  wardId: string
): boolean {
  if (!canAccessWard(session, wardId)) {
    return false;
  }

  return session.role !== "main_attendant";
}

export function canSetTriage(session: UserSession, wardId: string): boolean {
  if (!canAccessWard(session, wardId)) {
    return false;
  }

  return session.role === "admin" || session.role === "consultant_doctor";
}

export function assertPermission(
  condition: boolean,
  message = "You do not have permission to perform this action."
): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function getSessionFromHeaders(headers: Headers): UserSession {
  const role = headers.get("x-user-role") as StaffRole | null;
  const wardId = normalizeWardId(headers.get("x-user-ward-id") || undefined);
  const displayName = headers.get("x-user-name") || undefined;

  if (!role) {
    return normalizeSession(null);
  }

  return normalizeSession({ role, wardId, displayName });
}
