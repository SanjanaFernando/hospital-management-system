"use client";

import { useState } from "react";
import { Bed } from "@/app/types";
import { normalizeWardId } from "@/lib/rbac";

type GenderFilter = "all" | "Male" | "Female";
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

/** Small pill that indicates a bed's gender designation */
const GenderBadge = ({ gender }: { gender: Bed["gender"] }) => {
  if (!gender || gender === "Unisex") return null;

  const isMale = gender === "Male";
  return (
    <span
      className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none shadow-sm ${
        isMale
          ? "bg-blue-900/60 text-blue-100 border border-blue-300/40"
          : "bg-pink-900/60 text-pink-100 border border-pink-300/40"
      }`}
      title={`${gender} bed`}
    >
      {isMale ? "♂ M" : "♀ F"}
    </span>
  );
};

export default function BedGrid({
  beds,
  wardName,
  wardId,
  onAvailableBedClick,
  canInteract = true,
}: BedGridProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");

  const handleBedClick = (bed: Bed) => {
    if (!canInteract) return;
    onAvailableBedClick?.(bed);
  };

  const normalizedWardId = normalizeWardId(wardId);

  // Count occupied beds by gender for the filter pill labels
  const maleOccupied   = beds.filter((b) => b.patient?.gender === "Male").length;
  const femaleOccupied = beds.filter((b) => b.patient?.gender === "Female").length;
  const hasMale   = maleOccupied > 0;
  const hasFemale = femaleOccupied > 0;
  // Only show filter row when both genders are present
  const showGenderFilter = hasMale && hasFemale;

  // Empty / maintenance beds always show; occupied beds are gender-filtered
  const filteredBeds =
    genderFilter === "all"
      ? beds
      : beds.filter((b) => !b.patient || b.patient.gender === genderFilter);

  const filterPill = (f: GenderFilter, label: string) => (
    <button
      key={f}
      onClick={() => setGenderFilter(f)}
      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${
        genderFilter === f
          ? f === "Male"
            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
            : f === "Female"
            ? "bg-pink-500 border-pink-500 text-white shadow-sm"
            : "bg-slate-700 border-slate-700 text-white shadow-sm"
          : "bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full">
      {/* Header with Toggle Button for < lg screens */}
      <div className="flex items-center justify-between mb-3">
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

      {/* Gender filter pills — only shown when ward has both genders */}
      {showGenderFilter && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-xs text-slate-500 font-medium mr-0.5">Filter:</span>
          {filterPill("all",    `All (${beds.length})`)}
          {hasMale   && filterPill("Male",   `♂ Male (${maleOccupied})`)}
          {hasFemale && filterPill("Female", `♀ Female (${femaleOccupied})`)}
        </div>
      )}

      {/* Grid - always visible on lg+, collapsible on smaller screens */}
      <div
        className={`
          grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 
          lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 
          gap-3 overflow-hidden transition-all duration-300
          ${isOpen ? "grid" : "hidden lg:grid"}
        `}
      >
        {filteredBeds.map((bed) => (
          <div
            key={bed.id}
            onClick={() => handleBedClick(bed)}
            className={`
              ${getBedColor(bed)} 
              relative text-white rounded-lg p-4 transition-all shadow-md 
              flex flex-col items-center justify-center min-h-30 h-full
              ${
                canInteract
                  ? "cursor-pointer hover:shadow-lg active:scale-95"
                  : "cursor-not-allowed opacity-70"
              }
            `}
            title={`${statusLabels[bed.status]}${
              bed.gender && bed.gender !== "Unisex" ? ` [${bed.gender}]` : ""
            }${
              bed.patient ? ` - ${bed.patient.name}` : ""
            }${
              bed.patient?.assignedFromWardId
                ? ` (Transferred from ${formatWardLabel(
                    bed.patient.assignedFromWardId
                  )})`
                : ""
            }`}
          >
            {/* Gender badge */}
            <GenderBadge gender={bed.gender} />

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
                      <p className="mt-1 rounded-full bg-cyan-900/40 border border-cyan-300/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider truncate text-cyan-100 flex items-center justify-center gap-1 shadow-2xs">
                        <span>⇄</span> From {formatWardLabel(bed.patient.assignedFromWardId)}
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
