export type BedStatus = "available" | "occupied" | "maintenance";
export type AgeGroup = "Child" | "Adult" | "Elderly";
export type Priority =
  | "Triage 1"
  | "Triage 2"
  | "Triage 3"
  | "Triage 4"
  | "Triage 5";
export type Gender = "Male" | "Female";

export interface Patient {
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
}

export interface Bed {
  id: string;
  bedNumber: number;
  status: BedStatus;
  patient?: Patient;
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
