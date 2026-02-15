"use client";

import { useState, useEffect } from "react";
import { Ward } from "@/app/types";
import WardCard from "@/app/components/WardCard";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { initializeWards } from "@/app/utils/mockData";
import { getWardsWithPatients } from "@/app/actions/wardActions";

export default function Home() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Load wards from server action on mount
  useEffect(() => {
    loadWards();
  }, []);

  const loadWards = async () => {
    setIsLoading(true);
    setError("");
    try {
      console.log("📱 Frontend: Calling server action to fetch wards...");
      const wardsData = await getWardsWithPatients();

      if (wardsData && wardsData.length > 0) {
        console.log(
          `✅ Frontend: Received ${wardsData.length} wards from server`,
        );
        setWards(wardsData);
      } else {
        throw new Error("No wards returned from server");
      }
    } catch (err) {
      console.error("❌ Frontend: Error loading wards:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      // Fallback to mock data on error
      console.log("📋 Frontend: Falling back to mock data");
      const mockWards = initializeWards();
      setWards(mockWards);
      setError(
        `Using sample data - ${errorMsg}. Please check MongoDB connection.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

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
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
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

        {/* Error Message */}
        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <MedicalCrossLoader message="Loading Hospital Wards..." />
        )}

        {/* Overall Statistics */}
        {!isLoading && (
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
              <p className="text-3xl font-bold text-blue-600">
                {totalOccupied}
              </p>
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
        )}

        {/* Wards Grid */}
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Wards</h2>
          <div className="grid grid-cols-2 gap-6">
            {wards.map((ward) => (
              <WardCard key={ward.id} ward={ward} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
