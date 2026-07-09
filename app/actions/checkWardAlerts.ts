"use server";

import { getWardsWithPatientsData } from "@/lib/hospital-data";
import { createNotification } from "@/app/actions/notificationActions";

/**
 * Scan all wards and auto-generate notifications for critical states.
 * Uses a 60-minute deduplication window to prevent spam.
 */
export async function checkWardAlerts(): Promise<void> {
  try {
    const wards = await getWardsWithPatientsData();

    for (const ward of wards) {
      const wardId = ward.wardId || ward.id;

      // Ward full with patients waiting
      if (ward.availableBeds === 0 && ward.patientQueue.length > 0) {
        await createNotification({
          type: "ward_full",
          title: "Ward Full",
          message: `${ward.name} has no available beds — ${ward.patientQueue.length} patient${ward.patientQueue.length === 1 ? "" : "s"} waiting in queue`,
          wardId,
          severity: "critical",
          deduplicateMinutes: 60,
        });
      }

      // Queue overflow (>10 patients)
      if (ward.patientQueue.length > 10) {
        await createNotification({
          type: "queue_overflow",
          title: "Queue Overflow",
          message: `${ward.name} has ${ward.patientQueue.length} patients in the queue`,
          wardId,
          severity: "warning",
          deduplicateMinutes: 60,
        });
      }
    }
  } catch (error) {
    console.error("Failed to check ward alerts:", error);
  }
}
