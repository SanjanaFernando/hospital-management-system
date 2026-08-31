"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Ward } from "@/app/types";
import PatientRegistrationForm from "@/app/components/PatientRegistrationForm";
import PatientList from "@/app/components/PatientList";
import { getWardWithPatients } from "@/app/actions/wardActions";
import { dischargePatientById } from "@/app/actions/patientActions";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canAccessWard, canRegisterPatient } from "@/lib/rbac";

interface WardPatientsClientProps {
  initialWard: Ward;
}

export default function WardPatientsClient({
  initialWard,
}: WardPatientsClientProps) {
  const { session } = useAuthSession();
  const router = useRouter();
  const [ward, setWard] = useState(initialWard);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);

  const resolvedWardId = ward.wardId || ward.id;
  const wardAccessAllowed = canAccessWard(session, resolvedWardId);
  const canRegisterInWard = canRegisterPatient(session, resolvedWardId);

  const refreshWard = async () => {
    const wardData = await getWardWithPatients(resolvedWardId);
    if (wardData) {
      setWard(wardData);
    }
    router.refresh();
  };

  const handleDischargePatient = async (patientId: string) => {
    const patient = [...ward.patients, ...ward.patientQueue].find(
      (entry) => entry.id === patientId || entry._id === patientId
    );

    const patientName = patient?.name || "this patient";
    const shouldDischarge = window.confirm(
      `Discharge ${patientName} from ${ward.name}?`
    );

    if (!shouldDischarge) {
      return;
    }

    await dischargePatientById(patientId, session);
    await refreshWard();
  };

  if (!wardAccessAllowed) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            Access denied
          </h1>
          <p className="text-gray-600">
            Your role is scoped to a different ward.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/wards/${resolvedWardId}`}
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{ward.name}</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Patients Management
              </h1>
            </div>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-md sm:text-lg font-semibold text-gray-800">
            Manage Patients
          </h2>
          <button
            onClick={() => setShowRegistrationForm((prev) => !prev)}
            disabled={!canRegisterInWard}
            className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            {!canRegisterInWard
              ? "Registration blocked"
              : showRegistrationForm
                ? "Close Form"
                : "+ Register Patient"}
          </button>
        </div>

        {showRegistrationForm && canRegisterInWard && (
          <div className="mb-8">
            <PatientRegistrationForm
              wardId={resolvedWardId}
              onSuccess={async () => {
                setShowRegistrationForm(false);
                await refreshWard();
              }}
              onCancel={() => setShowRegistrationForm(false)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <PatientList
            title="Admitted Patients"
            patients={ward.patients}
            actionLabel="Discharge"
            onAction={(patient) => handleDischargePatient(patient.id)}
          />
          <PatientList
            title="Queued Patients"
            patients={ward.patientQueue}
            actionLabel="Discharge"
            onAction={(patient) => handleDischargePatient(patient.id)}
          />
          <PatientList
            title="Discharged Patients"
            patients={ward.dischargedPatients || []}
          />
        </div>
      </div>
    </div>
  );
}
