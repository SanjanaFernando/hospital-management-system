"use client";

import dynamic from "next/dynamic";
import type { DashboardWardSummary } from "@/lib/hospital-data";
import { useAuthSession } from "@/app/context/AuthSessionContext";

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

type LoaderProps = {
  wards: DashboardWardSummary[];
  showOccupancy?: boolean;
};

export default function DashboardChartsLoader(props: LoaderProps) {
  const { session } = useAuthSession();

  const effectiveShowOccupancy =
    typeof props.showOccupancy === "boolean"
      ? props.showOccupancy
      : session.role === "admin";

  let effectiveWards = props.wards ?? [];
  if (session.role !== "admin" && session.wardId) {
    const matched = effectiveWards.filter((w) => w.wardId === session.wardId);
    effectiveWards = matched.length > 0 ? matched : effectiveWards.slice(0, 1);
  }

  return (
    <DashboardCharts
      wards={effectiveWards}
      showOccupancy={effectiveShowOccupancy}
    />
  );
}
