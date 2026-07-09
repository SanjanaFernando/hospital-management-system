"use client";

import dynamic from "next/dynamic";
import type {
  DailyPatientDataPoint,
  DashboardWardSummary,
} from "@/lib/hospital-data";
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
  dailyPatientData: DailyPatientDataPoint[];
  showOccupancy?: boolean;
};

export default function DashboardChartsLoader(props: LoaderProps) {
  const { session } = useAuthSession();

  const isAdminRole = session.role === "admin" || session.role === "sub_admin";

  const effectiveShowOccupancy =
    typeof props.showOccupancy === "boolean"
      ? props.showOccupancy
      : isAdminRole;

  let effectiveWards = props.wards ?? [];
  if (!isAdminRole) {
    const assignedWardIds = session.wardIds || (session.wardId ? [session.wardId] : []);
    if (assignedWardIds.length > 0) {
      effectiveWards = effectiveWards.filter((w) => assignedWardIds.includes(w.wardId));
    } else {
      effectiveWards = effectiveWards.slice(0, 1);
    }
  }

  return (
    <DashboardCharts
      wards={effectiveWards}
      dailyPatientData={props.dailyPatientData}
      showOccupancy={effectiveShowOccupancy}
    />
  );
}
