export type BedStatus = "available" | "occupied" | "maintenance";
export type AgeGroup = "Child" | "Adult" | "Elderly";
export type Priority =
  | "Triage 1"
  | "Triage 2"
  | "Triage 3"
  | "Triage 4"
  | "Triage 5";
export type Gender = "Male" | "Female";
export type StaffRole =
  | "admin"
  | "sub_admin"
  | "consultant_doctor"
  | "main_sister"
  | "main_attendant";

export interface UserSession {
  userId?: string;
  role: StaffRole;
  wardId?: string;
  wardIds?: string[];
  displayName?: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: StaffRole;
  wardId?: string;
  wardIds?: string[];
  displayName: string;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Patient {
  _id?: string;
  id: string;
  name: string;
  age: number;
  ageGroup: AgeGroup;
  gender?: Gender;
  disease: string;
  priority: Priority;
  admissionTime: Date;
  dischargeTime?: Date;
  queueWaitTime?: number; // in minutes
  specialRequirements?: string[];
  wardId?: string;
  assignedFromWardId?: string | null;
  status?: "queued" | "admitted" | "discharged";
  triageRequested?: boolean;
  queueReason?: string; // MAPPO explanation for this patient's queue rank, set by reorderQueueWithAi
}

export interface QueuePrediction {
  enabled: boolean;
  load?: number;
  criticalShare?: number;
  expectedArrivals?: number;
  expectedCriticalPatients?: number;
  horizonHours?: number;
  surgePredicted?: boolean;
}

export interface Bed {
  id: string;
  bedNumber: number;
  status: BedStatus;
  patient?: Patient;
  type: "ICU" | "NORMAL"; 
}

export interface Ward {
  id: string;
  wardId?: string;
  name: string;
  beds: Bed[];
  patients: Patient[]; // currently admitted patients
  patientQueue: Patient[]; // waiting patients
  dischargedPatients?: Patient[]; // discharged patients history
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  queueOrderStrategy?: "ai" | "priority";
  queueOrderMessage?: string;
  queuePrediction?: QueuePrediction;
}

export interface StaffMember {
  id: string;
  name: string;
  role: Exclude<StaffRole, "admin" | "sub_admin">;
  wardId: string;
  createdAt: Date;
}

export type LogAction =
  | "patient_registered"
  | "patient_discharged"
  | "patient_assigned_bed"
  | "patient_force_assigned"
  | "patient_moved_to_queue"
  | "staff_registered"
  | "role_switched"
  | "bed_status_updated"
  | "notification_created";

export interface UserLog {
  _id?: string;
  id: string;
  action: LogAction;
  actorName: string;
  actorRole: StaffRole;
  wardId?: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  timestamp: Date;
}

export type NotificationType =
  | "ward_full"
  | "queue_overflow"
  | "patient_registered"
  | "patient_discharged"
  | "patient_assigned_bed"
  | "bed_status_changed"
  | "patient_critical";

export interface Notification {
  _id?: string;
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  wardId?: string;
  severity: "info" | "warning" | "critical";
  isRead: boolean;
  readByUserIds?: string[];
  targetUserId?: string;
  targetRole?: StaffRole;
  createdAt: Date;
  expiresAt?: Date;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRecipientType = "user" | "all" | "role";

export interface ChatMessage {
  _id?: string;
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: StaffRole;
  content: string;
  recipientType: ChatRecipientType;
  /** userId when recipientType==='user' */
  recipientId?: string;
  /** role name when recipientType==='role' */
  recipientRole?: StaffRole;
  readBy: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface ChatConversation {
  _id?: string;
  id: string;
  /** 'dm' for 1-on-1, 'broadcast' for group/role/all */
  type: "dm" | "broadcast";
  participants: string[];
  participantNames: Record<string, string>;
  lastMessage: string;
  lastMessageAt: Date;
  lastMessageBy: string;
  recipientType?: ChatRecipientType;
  recipientRole?: StaffRole;
  unreadBy: string[];
  createdAt: Date;
}

/** Lightweight user record used by the recipient picker */
export interface ChatUser {
  userId: string;
  displayName: string;
  role: StaffRole;
}
