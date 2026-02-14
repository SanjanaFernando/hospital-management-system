"use client";

import { useState } from "react";
import { Ward } from "@/app/types";
import WardCard from "@/app/components/WardCard";
import BedGrid from "@/app/components/BedGrid";
import PatientQueue from "@/app/components/PatientQueue";
import { initializeWards } from "@/app/utils/mockData";

export default function Home() {
  const [wards] = useState<Ward[]>(initializeWards());
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);

  const selectedWard = selectedWardId
    ? wards.find((w) => w.id === selectedWardId)
    : null;

  const totalAvailable = wards.reduce(
    (sum, ward) => sum + ward.availableBeds,
    0,
  );
  const totalOccupied = wards.reduce((sum, ward) => sum + ward.occupiedBeds, 0);
  const totalMaintenance = wards.reduce(
    (sum, ward) => sum + ward.maintenanceBeds,
    0,
  );
  const totalQueue = wards.reduce(
    (sum, ward) => sum + ward.patientQueue.length,
    0,
  );
  const totalBeds = wards.reduce((sum, ward) => sum + ward.totalBeds, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Hospital Bed Management System
          </h1>
          <p className="text-gray-600">
            Real-time bed availability, patient details, and ward management
          </p>
        </div>

        {/* Overall Statistics */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <p className="text-sm text-gray-600 mb-2">Available Beds</p>
            <p className="text-3xl font-bold text-green-600">
              {totalAvailable}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {Math.round((totalAvailable / totalBeds) * 100)}% of total
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <p className="text-sm text-gray-600 mb-2">Occupied Beds</p>
            <p className="text-3xl font-bold text-blue-600">{totalOccupied}</p>
            <p className="text-xs text-gray-500 mt-2">
              {Math.round((totalOccupied / totalBeds) * 100)}% of total
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-600 mb-2">Maintenance</p>
            <p className="text-3xl font-bold text-yellow-600">
              {totalMaintenance}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {Math.round((totalMaintenance / totalBeds) * 100)}% of total
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500">
            <p className="text-sm text-gray-600 mb-2">Waiting</p>
            <p className="text-3xl font-bold text-purple-600">{totalQueue}</p>
            <p className="text-xs text-gray-500 mt-2">In queue</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-gray-500">
            <p className="text-sm text-gray-600 mb-2">Total Beds</p>
            <p className="text-3xl font-bold text-gray-600">{totalBeds}</p>
            <p className="text-xs text-gray-500 mt-2">Across all wards</p>
          </div>
        </div>

        {/* Wards Grid */}
        {!selectedWard ? (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Wards</h2>
            <div className="grid grid-cols-2 gap-6">
              {wards.map((ward) => (
                <WardCard
                  key={ward.id}
                  ward={ward}
                  onClick={setSelectedWardId}
                />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setSelectedWardId(null)}
              className="mb-6 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← Back to Wards
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Beds Grid */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-8">
                <BedGrid
                  beds={selectedWard.beds}
                  wardName={selectedWard.name}
                />
              </div>
              {/* Patient Queue */}
              <div className="bg-white rounded-lg shadow-md p-8">
                <PatientQueue
                  queue={selectedWard.patientQueue}
                  wardName={selectedWard.name}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
