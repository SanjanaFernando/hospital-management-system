import { StaffRole, UserSession, PermissionKey, RolePermissionsMap } from "@/app/types";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  sub_admin: "Sub Admin",
  consultant_doctor: "Consultant Doctor",
  main_sister: "Main Sister",
  main_attendant: "Main Attendant",
};

// ---------------------------------------------------------------------------
// Permission Catalogue
// ---------------------------------------------------------------------------

export const PERMISSION_KEYS: PermissionKey[] = [
  "register_patient",
  "admit_patient",
  "discharge_patient",
  "set_triage",
  "move_patient_cross_ward",
  "update_bed_status",
  "assign_bed",
  "view_queue",
  "reorder_queue",
  "view_reports",
  "view_logs",
  "manage_users",
  "manage_roles",
  "send_broadcast",
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  register_patient: "Register a Patient",
  admit_patient: "Admit Patient to Bed",
  discharge_patient: "Discharge a Patient",
  set_triage: "Set / Request Triage",
  move_patient_cross_ward: "Move Patient Across Wards",
  update_bed_status: "Update Bed Status",
  assign_bed: "Assign Bed to Patient",
  view_queue: "View Patient Queue",
  reorder_queue: "Reorder / Manage Queue",
  view_reports: "View Reports & Analytics",
  view_logs: "View Audit Logs",
  manage_users: "Manage Users (Create/Edit/Delete)",
  manage_roles: "Manage Role Permissions",
  send_broadcast: "Send Broadcast Messages",
};

export const PERMISSION_CATEGORIES: Record<string, PermissionKey[]> = {
  "Patient Management": [
    "register_patient",
    "admit_patient",
    "discharge_patient",
    "set_triage",
    "move_patient_cross_ward",
  ],
  "Bed Management": ["update_bed_status", "assign_bed"],
  "Queue Management": ["view_queue", "reorder_queue"],
  "Reports & Logs": ["view_reports", "view_logs"],
  "User & Role Administration": ["manage_users", "manage_roles"],
  Communication: ["send_broadcast"],
};

/** Default permission matrix — used when DB has no record for a role */
export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, RolePermissionsMap> = {
  admin: {
    register_patient: true,
    admit_patient: true,
    discharge_patient: true,
    set_triage: true,
    move_patient_cross_ward: true,
    update_bed_status: true,
    assign_bed: true,
    view_queue: true,
    reorder_queue: true,
    view_reports: true,
    view_logs: true,
    manage_users: true,
    manage_roles: true,
    send_broadcast: true,
  },
  sub_admin: {
    register_patient: true,
    admit_patient: true,
    discharge_patient: true,
    set_triage: true,
    move_patient_cross_ward: true,
    update_bed_status: true,
    assign_bed: true,
    view_queue: true,
    reorder_queue: true,
    view_reports: true,
    view_logs: true,
    manage_users: true,
    manage_roles: false,
    send_broadcast: true,
  },
  consultant_doctor: {
    register_patient: true,
    admit_patient: true,
    discharge_patient: true,
    set_triage: true,
    move_patient_cross_ward: true,
    update_bed_status: true,
    assign_bed: true,
    view_queue: true,
    reorder_queue: true,
    view_reports: true,
    view_logs: false,
    manage_users: false,
    manage_roles: false,
    send_broadcast: true,
  },
  main_sister: {
    register_patient: true,
    admit_patient: true,
    discharge_patient: true,
    set_triage: false,
    move_patient_cross_ward: false,
    update_bed_status: true,
    assign_bed: true,
    view_queue: true,
    reorder_queue: false,
    view_reports: true,
    view_logs: false,
    manage_users: false,
    manage_roles: false,
    send_broadcast: true,
  },
  main_attendant: {
    register_patient: false,
    admit_patient: false,
    discharge_patient: false,
    set_triage: false,
    move_patient_cross_ward: false,
    update_bed_status: true,
    assign_bed: false,
    view_queue: true,
    reorder_queue: false,
    view_reports: false,
    view_logs: false,
    manage_users: false,
    manage_roles: false,
    send_broadcast: true,
  },
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
