import { StaffRole, UserSession } from "@/app/types";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  sub_admin: "Sub Admin",
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
    // No role supplied — fail closed to the least-privileged role, not admin.
    return { role: "main_attendant", displayName: "Guest" };
  }

  const role = input.role;
  if (role === "admin" || role === "sub_admin") {
    return {
      userId: input.userId,
      role,
      displayName: input.displayName || ROLE_LABELS[role],
    };
  }

  // Gather and normalize all assigned wards
  let wardIds: string[] = [];
  if (Array.isArray(input.wardIds)) {
    wardIds = input.wardIds.map(normalizeWardId).filter(Boolean) as string[];
  } else if (input.wardId) {
    const single = normalizeWardId(input.wardId);
    if (single) wardIds = [single];
  }

  return {
    userId: input.userId,
    role,
    wardId: wardIds[0] || undefined, // First assigned ward for backward compatibility
    wardIds,
    displayName: input.displayName || ROLE_LABELS[role],
  };
}

export function canAccessWard(session: UserSession, wardId: string): boolean {
  // All authenticated hospital staff can view/access any ward (read-only mode).
  // Management and update operations (like registering/discharging patients, updating bed status)
  // are still strictly restricted to their assigned wardIds list.
  return true;
}

export function canManageStaff(session: UserSession): boolean {
  return session.role === "admin" || session.role === "sub_admin";
}

export function canViewLogs(session: UserSession): boolean {
  return session.role === "admin" || session.role === "sub_admin";
}

export function canManageWardActions(
  session: UserSession,
  wardId: string
): boolean {
  // Admins and sub-admins can manage any ward. Non-admin managers must be assigned to the ward.
  if (session.role === "admin" || session.role === "sub_admin") return true;

  const targetWardId = normalizeWardId(wardId);
  if (!targetWardId || !session.wardIds?.includes(targetWardId))
    return false;

  return session.role === "consultant_doctor" || session.role === "main_sister";
}

export function canUpdateBedStatus(
  session: UserSession,
  wardId: string
): boolean {
  // Admins and sub-admins may update any ward. Others require assignment to the ward.
  if (session.role === "admin" || session.role === "sub_admin") return true;

  const targetWardId = normalizeWardId(wardId);
  if (!targetWardId || !session.wardIds?.includes(targetWardId))
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
  if (session.role === "admin" || session.role === "sub_admin") {
    return true;
  }

  if (session.role !== "consultant_doctor") {
    return false;
  }

  const normalizedSourceWardId = normalizeWardId(sourceWardId);
  const normalizedTargetWardId = normalizeWardId(targetWardId);

  if (!normalizedSourceWardId || !normalizedTargetWardId) return false;

  // Consultant must be assigned to the source ward
  return Boolean(session.wardIds?.includes(normalizedSourceWardId));
}

export function canRegisterPatient(
  session: UserSession,
  wardId: string
): boolean {
  // Admins and sub-admins can register anywhere. Non-admins must be assigned to the ward.
  if (session.role === "admin" || session.role === "sub_admin") return true;

  const targetWardId = normalizeWardId(wardId);
  if (!targetWardId || !session.wardIds?.includes(targetWardId))
    return false;

  return session.role !== "main_attendant";
}

export function canSetTriage(session: UserSession, wardId: string): boolean {
  // Admins and sub-admins can set triage anywhere. Consultants may set triage only in their ward.
  if (session.role === "admin" || session.role === "sub_admin") return true;

  const targetWardId = normalizeWardId(wardId);
  if (!targetWardId || !session.wardIds?.includes(targetWardId))
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
  const userId = headers.get("x-user-id") || undefined;
  
  const wardIdsRaw = headers.get("x-user-ward-ids");
  const wardIds = wardIdsRaw 
    ? (wardIdsRaw.split(",").map(normalizeWardId).filter(Boolean) as string[]) 
    : wardId ? [wardId] : [];

  if (!role) {
    return normalizeSession(null);
  }

  return normalizeSession({ userId, role, wardId, wardIds, displayName });
}
