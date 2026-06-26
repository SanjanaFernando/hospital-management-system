import Link from "next/link";
import { Metadata } from "next";
import { getServerSession } from "@/lib/session.server";
import { getWardsWithPatients } from "@/app/actions/wardActions";
import { ROLE_LABELS } from "@/lib/rbac";
import { ArrowLeft } from "lucide-react";
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
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              Reports
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              Hospital Reports
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Role: {ROLE_LABELS[session.role]}{" "}
              {session.wardId ? `- Ward ${session.wardId}` : ""}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
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
