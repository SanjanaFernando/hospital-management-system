"use client";

import dynamic from "next/dynamic";

const DashboardCharts = dynamic(
  () => import("@/app/components/dashboard/DashboardCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-90 rounded-3xl bg-white shadow-sm" />
        <div className="h-90 rounded-3xl bg-white shadow-sm" />
      </div>
    ),
  }
);

export default DashboardCharts;
