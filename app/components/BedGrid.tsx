"use client";

import { useState } from "react";
import { Bed } from "@/app/types";
import { normalizeWardId } from "@/lib/rbac";

interface BedGridProps {
  beds: Bed[];
  wardName: string;
  wardId?: string;
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

const getBedColor = (bed: Bed) => {
  if (bed.type === "ICU" && bed.status === "available") {
    return "bg-red-500 hover:bg-red-600";
  }
  if (bed.type === "ICU" && bed.status === "occupied") {
    return "bg-purple-500 hover:bg-purple-600";
  }
  if (bed.type === "ICU" && bed.status === "maintenance") {
    return "bg-pink-500 hover:bg-pink-300 text-gray-800";
  }
  return statusColors[bed.status];
};

const formatWardLabel = (wardId?: string | null) => {
  if (!wardId) return "";
  const normalized = wardId.toLowerCase();
  if (normalized.startsWith("ward-")) {
    return `Ward ${normalized.replace("ward-", "")}`;
  }
  return wardId;
};

const getShortName = (fullName?: string) => {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstNameInitial = parts[0][0] ? `${parts[0][0]}.` : "";
  const lastName = parts[parts.length - 1];
  return `${firstNameInitial} ${lastName}`;
};

export default function BedGrid({
  beds,
  wardName,
  wardId,
  onAvailableBedClick,
  canInteract = true,
}: BedGridProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleBedClick = (bed: Bed) => {
    if (!canInteract) return;
    onAvailableBedClick?.(bed);
  };

  const normalizedWardId = normalizeWardId(wardId);

  return (
    <div className="w-full">
      {/* Header with Toggle Button for < lg screens */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{wardName}</h3>

        {/* Dropdown toggle - visible only below lg */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="lg:hidden flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          aria-expanded={isOpen}
        >
          {isOpen ? "Hide Beds" : "Show Beds"}
          <span
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>
      </div>

      {/* Grid - always visible on lg+, collapsible on smaller screens */}
      <div
        className={`
          grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 
          lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 
          gap-3 overflow-hidden transition-all duration-300
          ${isOpen ? "grid" : "hidden lg:grid"}
        `}
      >
        {beds.map((bed) => (
          <div
            key={bed.id}
            onClick={() => handleBedClick(bed)}
            className={`
              ${getBedColor(bed)} 
              text-white rounded-lg p-4 transition-all shadow-md 
              flex flex-col items-center justify-center min-h-30 h-full
              ${
                canInteract
                  ? "cursor-pointer hover:shadow-lg active:scale-95"
                  : "cursor-not-allowed opacity-70"
              }
            `}
            title={`${statusLabels[bed.status]}${
              bed.patient ? ` - ${bed.patient.name}` : ""
            }${
              bed.patient?.assignedFromWardId
                ? ` (Transferred from ${formatWardLabel(
                    bed.patient.assignedFromWardId
                  )})`
                : ""
            }`}
          >
            <div className="text-center w-full min-w-0">
              <p className="text-sm font-bold truncate">
                {bed.type === "ICU"
                  ? `ICU Bed ${bed.bedNumber}`
                  : `Bed ${bed.bedNumber}`}
              </p>
              <p className="text-xs mt-1">{statusLabels[bed.status]}</p>

              {bed.patient && (
                <>
                  <p className="text-xs mt-1 font-semibold truncate max-w-full px-1" title={bed.patient.name}>
                    {getShortName(bed.patient.name)}
                  </p>
                  <p className="text-xs">{bed.patient.priority}</p>

                  {bed.patient.assignedFromWardId &&
                    bed.patient.assignedFromWardId !== normalizedWardId && (
                      <p className="mt-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide truncate">
                        From {formatWardLabel(bed.patient.assignedFromWardId)}
                      </p>
                    )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Optional empty state for small screens when closed */}
      {!isOpen && beds.length === 0 && (
        <p className="text-gray-500 text-sm lg:hidden">No beds available</p>
      )}
    </div>
  );
}
