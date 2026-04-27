"use client";

import { Bed } from "@/app/types";

interface BedGridProps {
  beds: Bed[];
  wardName: string;
  onAvailableBedClick?: (bed: Bed) => void;
  canInteract?: boolean;
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

export default function BedGrid({
  beds,
  wardName,
  onAvailableBedClick,
  canInteract = true,
}: BedGridProps) {
  const handleBedClick = (bed: Bed) => {
    if (!canInteract) {
      return;
    }

    onAvailableBedClick?.(bed);
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">{wardName}</h3>
      <div className="grid grid-cols-5 gap-3">
        {beds.map((bed) => (
          <div
            key={bed.id}
            onClick={() => handleBedClick(bed)}
            className={`${statusColors[bed.status]} text-white rounded-lg p-4 transition-all shadow-md flex flex-col items-center justify-center min-h-[120px] h-full ${canInteract ? "cursor-pointer hover:shadow-lg" : "cursor-not-allowed opacity-70"}`}
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
