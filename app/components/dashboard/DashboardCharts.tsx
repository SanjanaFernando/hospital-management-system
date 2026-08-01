"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  DailyPatientDataPoint,
  DashboardWardSummary,
} from "@/lib/hospital-data";
import { useAuthSession } from "@/app/context/AuthSessionContext";

type ChartMetric = "occupancy" | "queue" | "maintenance";

interface DashboardChartsProps {
  wards: DashboardWardSummary[];
  dailyPatientData: DailyPatientDataPoint[];
  showOccupancy?: boolean;
}

const pieColors = ["#3b82f6", "#06b6d4", "#8b5cf6", "#14b8a6", "#6366f1"];

export default function DashboardCharts({
  wards,
  dailyPatientData,
  showOccupancy = true,
}: DashboardChartsProps) {
  const { session } = useAuthSession();
  const isAdminRole = session.role === "admin" || session.role === "sub_admin";
  const [chartMetric, setChartMetric] = useState<ChartMetric>("occupancy");

  const [selectedWardFilter, setSelectedWardFilter] = useState<string>(() => {
    if (isAdminRole) return "all";
    return wards[0]?.wardId || "all";
  });

  const selectedWard = wards.find((w) => w.wardId === selectedWardFilter);
  const selectedWardIndex = selectedWard ? wards.indexOf(selectedWard) : -1;
  const barColor = selectedWardIndex !== -1 ? pieColors[selectedWardIndex % pieColors.length] : "var(--color-patients)";
  const barDataKey = selectedWardFilter === "all" ? "patients" : (selectedWard?.name || "patients");

  const chartSets = useMemo(() => {
    return {
      occupancy: wards.map((ward) => ({
        name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
        occupiedBeds: ward.occupiedBeds,
      })),
      queue: wards.map((ward) => ({
        name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
        queueCount: ward.queuedPatients,
      })),
      maintenance: wards.map((ward) => ({
        name: ward.name.replace(/^Ward\s+[A-Z]\s+-\s+/, ""),
        maintenanceBeds: ward.maintenanceBeds,
      })),
    };
  }, [wards]);

  const getChartData = () => {
    switch (chartMetric) {
      case "queue":
        return chartSets.queue;
      case "maintenance":
        return chartSets.maintenance;
      default:
        return chartSets.occupancy;
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

  return (
    <div
      className={
        showOccupancy ? "grid gap-6 lg:grid-cols-2" : "flex gap-6 flex-col"
      }
    >
      {showOccupancy && (
        <div className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {getChartTitle()}
              </h3>
              <p className="text-sm text-slate-500">{getChartDescription()}</p>
            </div>
            <select
              value={chartMetric}
              onChange={(event) =>
                setChartMetric(event.target.value as ChartMetric)
              }
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <option value="occupancy">Overall Occupancy</option>
              <option value="queue">Overall Queue</option>
              <option value="maintenance">Maintenance Beds</option>
            </select>
          </div>

          <ChartContainer
            config={{
              occupiedBeds: { label: "Occupied Beds", color: "#3b82f6" },
            }}
            className="h-75 w-full"
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

      <div className="w-full min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Daily Patients
            </h3>
            <p className="text-sm text-slate-500">Last 7 days admissions</p>
          </div>
          {wards.length > 0 && (
            <select
              value={selectedWardFilter}
              onChange={(event) => setSelectedWardFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
            >
              {isAdminRole && <option value="all">All Wards</option>}
              {wards.map((ward) => (
                <option key={ward.wardId} value={ward.wardId}>
                  {ward.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <ChartContainer
          config={{ patients: { label: "Patients", color: "#8b5cf6" } }}
          className="h-65 mt-[40px] ml-[-30px]  sm:mt-[60px] w-full min-w-0 xl:mt-0 xl:h-75"
        >
          <BarChart data={dailyPatientData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey={barDataKey}
              fill={barColor}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
