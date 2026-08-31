import Link from "next/link";
import { Metadata } from "next";
import { getServerSession } from "@/lib/session.server";
import { getWardsWithPatients } from "@/app/actions/wardActions";
import { ROLE_LABELS } from "@/lib/rbac";
import { ChevronLeft } from "lucide-react";
import ReportsTabs from "@/app/components/ReportsTabs";

export const metadata: Metadata = {
  title: "Reports | Hospital Bed Management System",
  description: "Hospital reports for wards, patients, and bed usage",
};

export default async function ReportsPage() {
  const session = await getServerSession();
  const wards = await getWardsWithPatients();

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-teal-50 to-cyan-100 p-4 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Hospital Reports
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Role: {ROLE_LABELS[session.role]}{" "}
              {session.wardId ? `- Ward ${session.wardId}` : ""}
            </p>
          </div>
        </div>

        <ReportsTabs
          wards={wards}
          role={session.role}
          wardId={session.wardId}
        />
      </div>
    </div>
  );
}
