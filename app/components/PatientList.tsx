"use client";

import { useState } from "react";
import { Patient } from "@/app/types";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PatientListProps {
  title: string;
  patients: Patient[];
  actionLabel?: string;
  onAction?: (patient: Patient) => void | Promise<void>;
  actionDisabled?: boolean;
}

const priorityClasses = {
  "Triage 1": "bg-red-100 text-red-800 border-red-200",
  "Triage 2": "bg-orange-100 text-orange-800 border-orange-200",
  "Triage 3": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Triage 4": "bg-lime-100 text-lime-800 border-lime-200",
  "Triage 5": "bg-blue-100 text-blue-800 border-blue-200",
};

export default function PatientList({
  title,
  patients,
  actionLabel,
  onAction,
  actionDisabled = false,
}: PatientListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      {/* Header — clickable toggle only below lg */}
      <div
        className="mb-4 flex items-center justify-between lg:cursor-default"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <h2 className="text-lg font-bold text-gray-800">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({patients.length})
          </span>
        </h2>
        <button
          type="button"
          aria-expanded={isOpen}
          className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 lg:hidden"
        >
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Content — always visible on lg+, toggled below lg */}
      <div className={`${!isOpen ? "hidden lg:block" : ""}`}>
        {patients.length === 0 ? (
          <p className="text-sm text-gray-500">No patients to display.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-1">
            {patients.map((patient) => (
              <div
                key={patient.id}
                className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 p-4 xl:flex-row"
              >
                <div className="min-w-0 flex flex-col items-center gap-1 text-center xl:items-start xl:text-start">
                  <p className="font-semibold text-gray-800">{patient.name}</p>
                  <p className="text-sm text-gray-500">
                    {patient.age} yrs - {patient.disease}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityClasses[patient.priority]}`}
                  >
                    {patient.priority}
                  </span>
                </div>

                <div className="ml-3 flex items-center gap-2">
                  {actionLabel && onAction && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onAction(patient);
                      }}
                      disabled={actionDisabled}
                      className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                    >
                      {actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
