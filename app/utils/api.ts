import { Ward, Patient } from "@/app/types";
import { UserSession } from "@/app/types";
import { clearClientCache } from "@/app/utils/clientCache";

const API_BASE_URL = "/api";

function buildSessionHeaders(actor?: UserSession): HeadersInit {
  if (!actor) {
    return {};
  }

  return {
    "x-user-role": actor.role,
    "x-user-ward-id": actor.wardId || "",
    "x-user-name": actor.displayName || "",
  };
}

// WARDS
export async function fetchWards(): Promise<Ward[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/wards`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data?.error || "Failed to fetch wards";
      const details = data?.details || "";
      throw new Error(`${errorMsg}${details ? " - " + details : ""}`);
    }

    const wards = await response.json();
    return wards || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Error fetching wards:", errorMsg);
    // Return empty array so page can fall back to mock data
    return [];
  }
}

export async function createWard(
  ward: Record<string, unknown>
): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/wards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ward),
    });
    if (!response.ok) throw new Error("Failed to create ward");
    return response.json();
  } catch (error) {
    console.error("Error creating ward:", error);
    throw error;
  }
}

// PATIENTS
export async function fetchPatients(wardId?: string): Promise<Patient[]> {
  try {
    const url = wardId
      ? `${API_BASE_URL}/patients?wardId=${wardId}`
      : `${API_BASE_URL}/patients`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch patients");
    return response.json();
  } catch (error) {
    console.error("Error fetching patients:", error);
    return [];
  }
}

export async function createPatient(
  patient: Record<string, unknown>,
  actor?: UserSession
): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/patients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildSessionHeaders(actor),
      },
      body: JSON.stringify(patient),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error || "Failed to create patient";
      const details = data?.details || "";
      throw new Error(`${errorMessage}${details ? ": " + details : ""}`);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating patient:", message);
    throw new Error(message);
  }
}

export async function updatePatient(
  patientId: string,
  data: Record<string, unknown>,
  actor?: UserSession
): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/patients/${patientId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildSessionHeaders(actor),
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to update patient");
    clearClientCache();
    return response.json();
  } catch (error) {
    console.error("Error updating patient:", error);
    throw error;
  }
}

export async function deletePatient(patientId: string): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/patients/${patientId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error("Failed to delete patient");
    clearClientCache();
    return response.json();
  } catch (error) {
    console.error("Error deleting patient:", error);
    throw error;
  }
}

// BEDS
export async function fetchBeds(
  wardId?: string
): Promise<Record<string, unknown>[]> {
  try {
    const url = wardId
      ? `${API_BASE_URL}/beds?wardId=${wardId}`
      : `${API_BASE_URL}/beds`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch beds");
    return response.json();
  } catch (error) {
    console.error("Error fetching beds:", error);
    return [];
  }
}

export async function createBed(
  bed: Record<string, unknown>
): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE_URL}/beds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bed),
    });
    if (!response.ok) throw new Error("Failed to create bed");
    return response.json();
  } catch (error) {
    console.error("Error creating bed:", error);
    throw error;
  }
}
