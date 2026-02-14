"use client";

import { Patient } from "@/app/types";

interface PatientQueueProps {
  queue: Patient[];
  wardName: string;
}

const priorityColors = {
  Critical: "bg-red-100 border-red-500 text-red-800",
  Urgent: "bg-orange-100 border-orange-500 text-orange-800",
  "Non-urgent": "bg-blue-100 border-blue-500 text-blue-800",
};

const ageGroupBadgeColors = {
  Child: "bg-purple-100 text-purple-800",
  Adult: "bg-green-100 text-green-800",
  Elderly: "bg-pink-100 text-pink-800",
};

export default function PatientQueue({ queue }: PatientQueueProps) {
  if (queue.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <p className="text-gray-500">No patients in queue</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Patient Queue ({queue.length})
      </h3>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {queue.map((patient, index) => (
          <div
            key={patient.id}
            className={`border-l-4 rounded-lg p-4 ${priorityColors[patient.priority]}`}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold">
                  {index + 1}. {patient.name}
                </p>
                <p className="text-sm flex gap-2 mt-1">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${ageGroupBadgeColors[patient.ageGroup]}`}
                  >
                    {patient.ageGroup} ({patient.age}y)
                  </span>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200">
                    {patient.disease}
                  </span>
                </p>
              </div>
              <span className="text-xs font-bold">{patient.priority}</span>
            </div>
            <p className="text-xs mt-2">
              Arrival: {new Date(patient.admissionTime).toLocaleString()}
            </p>
            {patient.queueWaitTime && (
              <p className="text-xs mt-1 font-semibold">
                Waiting: {patient.queueWaitTime} mins
              </p>
            )}
            {patient.specialRequirements &&
              patient.specialRequirements.length > 0 && (
                <p className="text-xs mt-2">
                  <span className="font-semibold">Special needs:</span>{" "}
                  {patient.specialRequirements.join(", ")}
                </p>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}
