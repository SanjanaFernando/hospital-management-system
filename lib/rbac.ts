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

const LEGACY_WARD_ID_MAP: Record<string, string> = {
  "ward-0": "ward-3",
  "ward-1": "ward-4",
  "ward-2": "ward-5",
};

export function normalizeWardId(wardId?: string): string | undefined {
  if (!wardId) {
    return undefined;
  }

  const value = wardId.trim().toLowerCase();

  if (value in LEGACY_WARD_ID_MAP) {
    return LEGACY_WARD_ID_MAP[value];
  }

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
  // Admins can access everything. Consultants may view other wards,
  // but management/update operations will still enforce same-ward checks.
  if (session.role === "admin") {
    return true;
  }

  if (session.role === "consultant_doctor") {
    // Consultants are allowed to view other wards (read-only access).
    return true;
  }

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);

  return (
    Boolean(sessionWardId) &&
    Boolean(targetWardId) &&
    sessionWardId === targetWardId
  );
}

export function canManageStaff(session: UserSession): boolean {
  return session.role === "admin";
}

export function canViewLogs(session: UserSession): boolean {
  return session.role === "admin";
}

export function canManageWardActions(
  session: UserSession,
  wardId: string
): boolean {
  // Admins can manage any ward. Non-admin managers must be assigned to the same ward.
  if (session.role === "admin") return true;

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);
  if (!sessionWardId || !targetWardId || sessionWardId !== targetWardId)
    return false;

  return session.role === "consultant_doctor" || session.role === "main_sister";
}

export function canUpdateBedStatus(
  session: UserSession,
  wardId: string
): boolean {
  // Admins may update any ward. Others require same-ward assignment.
  if (session.role === "admin") return true;

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);
  if (!sessionWardId || !targetWardId || sessionWardId !== targetWardId)
    return false;

  return (
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

export function canAssignQueuedPatientAcrossWards(
  session: UserSession,
  sourceWardId: string,
  targetWardId: string
): boolean {
  if (session.role === "admin") {
    return true;
  }

  if (session.role !== "consultant_doctor") {
    return false;
  }

  const sessionWardId = normalizeWardId(session.wardId);
  const normalizedSourceWardId = normalizeWardId(sourceWardId);
  const normalizedTargetWardId = normalizeWardId(targetWardId);

  return (
    Boolean(sessionWardId) &&
    Boolean(normalizedSourceWardId) &&
    Boolean(normalizedTargetWardId) &&
    sessionWardId === normalizedSourceWardId
  );
}

export function canRegisterPatient(
  session: UserSession,
  wardId: string
): boolean {
  // Admins can register anywhere. Non-admins must be assigned to the ward.
  if (session.role === "admin") return true;

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);
  if (!sessionWardId || !targetWardId || sessionWardId !== targetWardId)
    return false;

  return session.role !== "main_attendant";
}

export function canSetTriage(session: UserSession, wardId: string): boolean {
  // Admins can set triage anywhere. Consultants may set triage only in their ward.
  if (session.role === "admin") return true;

  const sessionWardId = normalizeWardId(session.wardId);
  const targetWardId = normalizeWardId(wardId);
  if (!sessionWardId || !targetWardId || sessionWardId !== targetWardId)
    return false;

  return session.role === "consultant_doctor";
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
