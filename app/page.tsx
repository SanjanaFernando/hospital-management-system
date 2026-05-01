"use client";

import { useState, useEffect } from "react";
import { Ward } from "@/app/types";
import WardCard from "@/app/components/WardCard";
import MedicalCrossLoader from "@/app/components/MedicalCrossLoader";
import { initializeWards } from "@/app/utils/mockData";
import { getWardsWithPatients } from "@/app/actions/wardActions";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Bar,
  BarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canAccessWard } from "@/lib/rbac";
import {
  CLIENT_CACHE_TTL,
  getClientCache,
  setClientCache,
} from "@/app/utils/clientCache";

export default function Home() {
  const { session } = useAuthSession();
  const isAdmin = session.role === "admin";
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllWards, setShowAllWards] = useState(false);
  const [chartMetric, setChartMetric] = useState<
    "occupancy" | "queue" | "maintenance"
  >("occupancy");

  // Load wards from server action on mount
  useEffect(() => {
    loadWards();
  }, []);

  const loadWards = async () => {
    const cacheKey = "wards:all";
    const cachedWards = getClientCache<Ward[]>(
      cacheKey,
      CLIENT_CACHE_TTL.wards
    );

    if (cachedWards && cachedWards.length > 0) {
      setWards(cachedWards);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    setError("");
    try {
      console.log("📱 Frontend: Calling server action to fetch wards...");
      const wardsData = await getWardsWithPatients();

      if (wardsData && wardsData.length > 0) {
        console.log(
          `✅ Frontend: Received ${wardsData.length} wards from server`
        );
        setWards(wardsData);
        setClientCache(cacheKey, wardsData);
      } else {
        throw new Error("No wards returned from server");
      }
    } catch (err) {
      console.error("❌ Frontend: Error loading wards:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      if (cachedWards && cachedWards.length > 0) {
        setError(`Showing cached data - ${errorMsg}`);
        return;
      }

      // Fallback to mock data on error
      console.log("📋 Frontend: Falling back to mock data");
      const mockWards = initializeWards();
      setWards(mockWards);
      setError(
        `Using sample data - ${errorMsg}. Please check MongoDB connection.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const scopedWards = wards.filter((ward) =>
    canAccessWard(session, ward.wardId || ward.id)
  );

  const wardsForCards = session.role === "main_attendant" ? scopedWards : wards;

  const totalAvailable = scopedWards.reduce(
    (sum, ward) => sum + ward.availableBeds,
    0
  );
  const totalOccupied = scopedWards.reduce(
    (sum, ward) => sum + ward.occupiedBeds,
    0
  );
  const totalMaintenance = scopedWards.reduce(
    (sum, ward) => sum + ward.maintenanceBeds,
    0
  );
  const totalQueue = scopedWards.reduce(
    (sum, ward) => sum + ward.patientQueue.length,
    0
  );
  const totalBeds = scopedWards.reduce((sum, ward) => sum + ward.totalBeds, 0);
  const totalAvailablePercent =
    totalBeds > 0 ? Math.round((totalAvailable / totalBeds) * 100) : 0;
  const totalOccupiedPercent =
    totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;
  const totalMaintenancePercent =
    totalBeds > 0 ? Math.round((totalMaintenance / totalBeds) * 100) : 0;

  const wardPieData = scopedWards.map((ward) => ({
    name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
    occupiedBeds: ward.occupiedBeds,
  }));

  const wardQueueData = scopedWards.map((ward) => ({
    name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
    queueCount: ward.patientQueue.length,
  }));

  const wardMaintenanceData = scopedWards.map((ward) => ({
    name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
    maintenanceBeds: ward.maintenanceBeds,
  }));

  const getChartData = () => {
    switch (chartMetric) {
      case "queue":
        return wardQueueData;
      case "maintenance":
        return wardMaintenanceData;
      default:
        return wardPieData;
    }
  };

  const getChartDataKey = () => {
    switch (chartMetric) {
      case "queue":
        return "queueCount";
      case "maintenance":
        return "maintenanceBeds";
      default:
        return "occupiedBeds";
    }
  };

  const getChartTitle = () => {
    switch (chartMetric) {
      case "queue":
        return "Overall Queue";
      case "maintenance":
        return "Overall Maintenance Beds";
      default:
        return "Overall Wards Occupancy";
    }
  };

  const getChartDescription = () => {
    switch (chartMetric) {
      case "queue":
        return "Waiting patients by ward";
      case "maintenance":
        return "Maintenance beds by ward";
      default:
        return "Occupied bed share by ward";
    }
  };

  const pieColors = ["#3b82f6", "#06b6d4", "#8b5cf6", "#14b8a6", "#6366f1"];

  const dailyPatientData = (() => {
    const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const dayKeyFormatter = new Intl.DateTimeFormat("en-CA");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const dateMap = new Map<string, { day: string; patients: number }>();

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dateMap.set(dayKeyFormatter.format(date), {
        day: dayFormatter.format(date),
        patients: 0,
      });
    }

    const allPatients = scopedWards.flatMap((ward) => [
      ...ward.patients,
      ...ward.patientQueue,
    ]);

    allPatients.forEach((patient) => {
      if (patient.admissionTime) {
        const admissionDate = new Date(patient.admissionTime);
        admissionDate.setHours(0, 0, 0, 0);
        const key = dayKeyFormatter.format(admissionDate);
        const current = dateMap.get(key);
        if (current) {
          current.patients += 1;
        }
      }
    });

    return Array.from(dateMap.values());
  })();

  const wardPieChartConfig = {
    occupiedBeds: {
      label: "Occupied Beds",
      color: "#3b82f6",
    },
  };

  const dailyPatientsChartConfig = {
    patients: {
      label: "Patients",
      color: "#8b5cf6",
    },
  };

  const wardsByOccupancy = [...wardsForCards].sort((a, b) => {
    const occupancyA = a.totalBeds === 0 ? 0 : a.occupiedBeds / a.totalBeds;
    const occupancyB = b.totalBeds === 0 ? 0 : b.occupiedBeds / b.totalBeds;
    return occupancyB - occupancyA;
  });

  const displayedWards = showAllWards
    ? wardsByOccupancy
    : wardsByOccupancy.slice(0, 3);

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            {isAdmin ? "Hospital Bed Management System" : "Ward Dashboard"}
          </h1>
          <p className="text-gray-600">
            {isAdmin
              ? "Real-time bed availability, patient details, and ward management"
              : "Role-based ward view with patient and bed operations for your assigned ward"}
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
          <MedicalCrossLoader
            message="Loading Hospital Dashboard..."
            fullScreen
          />
        )}

        {/* Overall Statistics */}
        {!isLoading && (
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow-md px-6 py-2 border-l-4 border-green-500">
              <p className="text-sm text-gray-600 mb-2">Available Beds</p>
              <p className="text-3xl font-bold text-green-600">
                {totalAvailable}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {totalAvailablePercent}% of total
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md px-6 py-2 border-l-4 border-blue-500">
              <p className="text-sm text-gray-600 mb-2">Occupied Beds</p>
              <p className="text-3xl font-bold text-blue-600">
                {totalOccupied}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {totalOccupiedPercent}% of total
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md px-6 py-2 border-l-4 border-yellow-500">
              <p className="text-sm text-gray-600 mb-2">Maintenance</p>
              <p className="text-3xl font-bold text-yellow-600">
                {totalMaintenance}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {totalMaintenancePercent}% of total
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md px-6 py-2 border-l-4 border-purple-500">
              <p className="text-sm text-gray-600 mb-2">Waiting</p>
              <p className="text-3xl font-bold text-purple-600">{totalQueue}</p>
              <p className="text-xs text-gray-500 mt-2">In queue</p>
            </div>
            <div className="bg-white rounded-lg shadow-md px-6 py-2 border-l-4 border-gray-500">
              <p className="text-sm text-gray-600 mb-2">Total Beds</p>
              <p className="text-3xl font-bold text-gray-600">{totalBeds}</p>
              <p className="text-xs text-gray-500 mt-2">
                {isAdmin ? "Across all wards" : "In your assigned ward"}
              </p>
            </div>
          </div>
        )}

        {/* Wards Grid */}
        {!isLoading && (
          <div
            className={`grid grid-cols-1 ${isAdmin ? "lg:grid-cols-2" : ""} gap-6 mb-8`}
          >
            {isAdmin && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {getChartTitle()}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {getChartDescription()}
                    </p>
                  </div>
                  <select
                    value={chartMetric}
                    onChange={(e) =>
                      setChartMetric(
                        e.target.value as "occupancy" | "queue" | "maintenance"
                      )
                    }
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="occupancy">Overall Occupancy</option>
                    <option value="queue">Overall Queue</option>
                    <option value="maintenance">Maintenance Beds</option>
                  </select>
                </div>
                <ChartContainer
                  config={wardPieChartConfig}
                  className="h-[300px] w-full"
                >
                  <PieChart>
                    <Pie
                      data={getChartData()}
                      dataKey={getChartDataKey()}
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                      label
                    >
                      {getChartData().map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${index}`}
                          fill={pieColors[index % pieColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                {isAdmin ? "Daily Overall Patients" : "Daily Patients"}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {isAdmin
                  ? "Last 7 days admissions (ward + queue)"
                  : "Last 7 days admissions in your ward"}
              </p>
              <ChartContainer
                config={dailyPatientsChartConfig}
                className="h-[300px] w-full"
              >
                <BarChart data={dailyPatientData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="patients"
                    fill="var(--color-patients)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">Wards</h2>
            {wardsByOccupancy.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllWards((prev) => !prev)}
                className="inline-flex items-center cursor-pointer gap-2 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                {showAllWards ? "Less" : "More"}
                <span
                  className={`transition-transform duration-300 ${
                    showAllWards ? "rotate-180" : "rotate-0"
                  }`}
                >
                  <ChevronDown size={16} />
                </span>
              </button>
            )}
          </div>
          <div className="flex flex-col gap-6">
            {displayedWards.map((ward) => (
              <WardCard key={ward.id} ward={ward} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
