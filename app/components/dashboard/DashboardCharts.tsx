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
import { DashboardWardSummary } from "@/lib/hospital-data";

type ChartMetric = "occupancy" | "queue" | "maintenance";

interface DashboardChartsProps {
  wards: DashboardWardSummary[];
  showOccupancy?: boolean;
}

const pieColors = ["#3b82f6", "#06b6d4", "#8b5cf6", "#14b8a6", "#6366f1"];

export default function DashboardCharts({
  wards,
  showOccupancy = true,
}: DashboardChartsProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("occupancy");

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

  const dailyPatientData = useMemo(() => {
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    });
    const dayKeyFormatter = new Intl.DateTimeFormat("en-CA");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const dateMap = new Map<string, { day: string; patients: number }>();

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      dateMap.set(dayKeyFormatter.format(date), {
        day: dayFormatter.format(date),
        patients: 0,
      });
    }

    return Array.from(dateMap.values());
  }, []);

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
    <div className={showOccupancy ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}>
      {showOccupancy && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
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

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Daily Patients</h3>
        <p className="mb-4 text-sm text-slate-500">Last 7 days admissions</p>
        <ChartContainer
          config={{ patients: { label: "Patients", color: "#8b5cf6" } }}
          className="h-75 w-full"
        >
          <BarChart data={dailyPatientData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
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
  );
}
