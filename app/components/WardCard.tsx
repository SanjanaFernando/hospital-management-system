"use client";

import { Ward } from "@/app/types";

interface WardCardProps {
  ward: Ward;
  onClick: (wardId: string) => void;
}

export default function WardCard({ ward, onClick }: WardCardProps) {
  const occupancyRate = Math.round(
    ((ward.totalBeds - ward.availableBeds) / ward.totalBeds) * 100,
  );

  return (
    <div
      onClick={() => onClick(ward.id)}
      className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-blue-500"
    >
      <h2 className="text-xl font-bold text-gray-800 mb-4">{ward.name}</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-50 p-3 rounded">
          <p className="text-sm text-gray-600">Available</p>
          <p className="text-2xl font-bold text-green-600">
            {ward.availableBeds}
          </p>
        </div>
        <div className="bg-blue-50 p-3 rounded">
          <p className="text-sm text-gray-600">Occupied</p>
          <p className="text-2xl font-bold text-blue-600">
            {ward.occupiedBeds}
          </p>
        </div>
        <div className="bg-yellow-50 p-3 rounded">
          <p className="text-sm text-gray-600">Maintenance</p>
          <p className="text-2xl font-bold text-yellow-600">
            {ward.maintenanceBeds}
          </p>
        </div>
        <div className="bg-purple-50 p-3 rounded">
          <p className="text-sm text-gray-600">In Queue</p>
          <p className="text-2xl font-bold text-purple-600">
            {ward.patientQueue.length}
          </p>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${occupancyRate}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-600 mb-4">Occupancy: {occupancyRate}%</p>

      {ward.patientQueue.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm">
          <p className="font-semibold text-purple-900 mb-2">Next in Queue:</p>
          {ward.patientQueue.slice(0, 2).map((patient) => (
            <p key={patient.id} className="text-xs text-purple-700 mb-1">
              • {patient.name} ({patient.priority})
            </p>
          ))}
          {ward.patientQueue.length > 2 && (
            <p className="text-xs text-purple-600 mt-1">
              +{ward.patientQueue.length - 2} more...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
