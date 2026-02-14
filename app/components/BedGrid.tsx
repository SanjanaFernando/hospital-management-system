"use client";

import { Bed, Patient } from "@/app/types";
import PatientDetail from "./PatientDetail";
import { useState } from "react";

interface BedGridProps {
  beds: Bed[];
  wardName: string;
}

const statusColors = {
  available: "bg-green-500 hover:bg-green-600",
  occupied: "bg-blue-500 hover:bg-blue-600",
  maintenance: "bg-yellow-500 hover:bg-yellow-600",
};

const statusLabels = {
  available: "Available",
  occupied: "Occupied",
  maintenance: "Maintenance",
};

export default function BedGrid({ beds, wardName }: BedGridProps) {
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);

  const handleDischargeSuccess = () => {
    setSelectedBed(null);
    // Parent component will handle data refresh through refetching
  };

  if (selectedBed && selectedBed.patient) {
    return (
      <div>
        <button
          onClick={() => setSelectedBed(null)}
          className="mb-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          ← Back to Beds
        </button>
        <PatientDetail
          patient={selectedBed.patient}
          onDischargeSuccess={handleDischargeSuccess}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">{wardName}</h3>
      <div className="grid grid-cols-5 gap-3">
        {beds.map((bed) => (
          <div
            key={bed.id}
            onClick={() => bed.status === "occupied" && setSelectedBed(bed)}
            className={`${statusColors[bed.status]} text-white rounded-lg p-4 cursor-pointer transition-all shadow-md hover:shadow-lg`}
            title={`${statusLabels[bed.status]}${bed.patient ? ` - ${bed.patient.name}` : ""}`}
          >
            <div className="text-center">
              <p className="text-sm font-bold">Bed {bed.bedNumber}</p>
              <p className="text-xs mt-1">{statusLabels[bed.status]}</p>
              {bed.patient && (
                <>
                  <p className="text-xs mt-1 font-semibold truncate">
                    {bed.patient.name}
                  </p>
                  <p className="text-xs">{bed.patient.priority}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
