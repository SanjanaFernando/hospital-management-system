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
  | "consultant_doctor"
  | "main_sister"
  | "main_attendant";

export interface UserSession {
  role: StaffRole;
  wardId?: string;
  displayName?: string;
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
}

export interface StaffMember {
  id: string;
  name: string;
  role: Exclude<StaffRole, "admin">;
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
  | "bed_status_updated";

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
