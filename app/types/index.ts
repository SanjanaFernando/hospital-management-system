export type BedStatus = "available" | "occupied" | "maintenance";
export type AgeGroup = "Child" | "Adult" | "Elderly";
export type Priority = "Critical" | "Urgent" | "Non-urgent";

export interface Patient {
  id: string;
  name: string;
  age: number;
  ageGroup: AgeGroup;
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
  name: string;
  beds: Bed[];
  patients: Patient[]; // currently admitted patients
  patientQueue: Patient[]; // waiting patients
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
}
