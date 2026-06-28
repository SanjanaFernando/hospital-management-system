"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bed, ClipboardList, Printer, Users } from "lucide-react";
import type { Ward } from "@/app/types";
import { ROLE_LABELS } from "@/lib/rbac";

type ReportTab = "ward" | "patient" | "bed";

interface ReportsTabsProps {
  wards: Ward[];
  role: keyof typeof ROLE_LABELS;
  wardId?: string;
}

function countWardStats(ward: Ward) {
  return {
    total: ward.beds.length,
    available: ward.beds.filter((bed) => bed.status === "available").length,
    occupied: ward.beds.filter((bed) => bed.status === "occupied").length,
    maintenance: ward.beds.filter((bed) => bed.status === "maintenance").length,
    admitted: ward.patients.length,
    queued: ward.patientQueue.length,
    discharged: ward.dischargedPatients?.length || 0,
  };
}

export default function ReportsTabs({ wards, role, wardId }: ReportsTabsProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("ward");
  const [selectedWardId, setSelectedWardId] = useState<string>("");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientSearch, setPatientSearch] = useState<string>("");
  const [selectedBedId, setSelectedBedId] = useState<string>("");

  const hospitalSummary = useMemo(
    () =>
      wards.reduce(
        (acc, ward) => {
          const stats = countWardStats(ward);
          acc.totalBeds += stats.total;
          acc.availableBeds += stats.available;
          acc.occupiedBeds += stats.occupied;
          acc.maintenanceBeds += stats.maintenance;
          acc.admittedPatients += stats.admitted;
          acc.queuedPatients += stats.queued;
          acc.dischargedPatients += stats.discharged;
          return acc;
        },
        {
          totalBeds: 0,
          availableBeds: 0,
          occupiedBeds: 0,
          maintenanceBeds: 0,
          admittedPatients: 0,
          queuedPatients: 0,
          dischargedPatients: 0,
        }
      ),
    [wards]
  );

  const visibleWards =
    role === "admin" || role === "consultant_doctor"
      ? wards
      : wardId
        ? wards.filter((ward) => (ward.wardId || ward.id) === wardId)
        : wards;

  useEffect(() => {
    const initialWard = visibleWards[0]?.wardId || visibleWards[0]?.id || "";
    setSelectedWardId((current) => current || initialWard);
  }, [visibleWards]);

  const selectedWard =
    visibleWards.find((ward) => (ward.wardId || ward.id) === selectedWardId) ||
    visibleWards[0];
  const selectedWardStats = selectedWard ? countWardStats(selectedWard) : null;
  const selectedBed = selectedWard?.beds.find(
    (bed) => bed.id === selectedBedId
  );

  useEffect(() => {
    const initialPatient =
      selectedWard?.patients[0]?.id ||
      selectedWard?.patientQueue[0]?.id ||
      selectedWard?.dischargedPatients?.[0]?.id ||
      "";
    setSelectedPatientId((current) => current || initialPatient);
  }, [selectedWard]);

  useEffect(() => {
    setSelectedBedId("");
  }, [selectedWard]);

  const wardPatients = useMemo(() => {
    if (!selectedWard) return [];
    return [
      ...selectedWard.patients,
      ...selectedWard.patientQueue,
      ...(selectedWard.dischargedPatients || []),
    ];
  }, [selectedWard]);

  const filteredWardPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return wardPatients;

    return wardPatients.filter((patient) =>
      [patient.name, patient.id, patient.disease, patient.priority]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [patientSearch, wardPatients]);

  const selectedPatient =
    filteredWardPatients.find((patient) => patient.id === selectedPatientId) ||
    wardPatients.find((patient) => patient.id === selectedPatientId) ||
    (patientSearch.trim() ? filteredWardPatients[0] : wardPatients[0]);

  return (
    <div>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 20mm 18mm 24mm 18mm;
          }

          body * {
            visibility: hidden !important;
          }

          .printable-report,
          .printable-report * {
            visibility: visible !important;
          }

          .printable-report {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }

          /* Each section block should not break in the middle */
          .report-section {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Activity log should start on same page if possible */
          .report-log-section {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Keep stat grid together */
          .report-stat-grid {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Row-level protection */
          .report-row {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .report-print-title {
            display: block !important;
          }
        }

        /* Hide the generated print title on screen */
        .report-print-title {
          display: none;
        }
      `}</style>

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm print:hidden">
        {[
          { id: "ward" as const, label: "Ward-wise Report" },
          { id: "patient" as const, label: "Patient-wise Report" },
          { id: "bed" as const, label: "Bed Report" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-teal-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "ward" && (
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Ward-wise Report
              </h2>
              <p className="text-sm text-slate-500">
                Select a ward to view and print its detailed report
              </p>
            </div>
            {(role === "admin" || role === "consultant_doctor") && (
              <SummaryCard
                label="Total Beds"
                value={hospitalSummary.totalBeds}
                icon={<Bed className="h-5 w-5" />}
              />
            )}
          </div>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row print:hidden">
            <div className="w-full lg:max-w-md">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Select ward
              </label>
              <select
                value={selectedWard?.wardId || selectedWard?.id || ""}
                onChange={(event) => {
                  setSelectedWardId(event.target.value);
                  setSelectedBedId("");
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              >
                {visibleWards.map((ward) => (
                  <option
                    key={ward.wardId || ward.id}
                    value={ward.wardId || ward.id}
                  >
                    {ward.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedWard && selectedWardStats && (
            <div className="printable-report mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-6 flex items-start justify-between gap-3 print:hidden">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Ward Report
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {selectedWard.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {selectedWard.wardId || selectedWard.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" />
                  Save PDF
                </button>
              </div>

              <WardReportLayout ward={selectedWard} stats={selectedWardStats} />
            </div>
          )}

          <div className="mt-4 space-y-4 print:hidden">
            {visibleWards.map((ward) => {
              const stats = countWardStats(ward);
              return (
                <div
                  key={ward.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {ward.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {ward.wardId || ward.id}
                      </p>
                    </div>
                    <Link
                      href={`/wards/${ward.wardId || ward.id}`}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                    >
                      Open ward
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatChip label="Beds" value={stats.total} />
                    <StatChip label="Available" value={stats.available} />
                    <StatChip label="Occupied" value={stats.occupied} />
                    <StatChip label="Maintenance" value={stats.maintenance} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "patient" && (
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Patient-wise Report
              </h2>
              <p className="text-sm text-slate-500">
                Select a ward, then pick a patient to view the full report
              </p>
            </div>
            {(role === "admin" || role === "consultant_doctor") && (
              <SummaryCard
                label="Admitted Patients"
                value={hospitalSummary.admittedPatients}
                icon={<Users className="h-5 w-5" />}
              />
            )}
          </div>
          <div className="mb-6 grid gap-4 md:grid-cols-2 print:hidden">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Ward
              </label>
              <select
                value={selectedWard?.wardId || selectedWard?.id || ""}
                onChange={(event) => {
                  setSelectedWardId(event.target.value);
                  setSelectedPatientId("");
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              >
                {visibleWards.map((ward) => (
                  <option
                    key={ward.wardId || ward.id}
                    value={ward.wardId || ward.id}
                  >
                    {ward.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Search patient by name
              </label>
              <input
                type="search"
                value={patientSearch}
                onChange={(event) => {
                  setPatientSearch(event.target.value);
                  setSelectedPatientId("");
                }}
                placeholder="Type a patient name"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Patient
              </label>
              <select
                value={selectedPatient?.id || ""}
                onChange={(event) => setSelectedPatientId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              >
                {filteredWardPatients.length === 0 ? (
                  <option value="">No patients available</option>
                ) : (
                  filteredWardPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} - {patient.status || "unknown"}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4 print:hidden">
              {visibleWards.map((ward) => (
                <div
                  key={`${ward.id}-patients`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <h3 className="mb-3 font-semibold text-slate-900">
                    {ward.name}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StatChip label="Admitted" value={ward.patients.length} />
                    <StatChip label="Queued" value={ward.patientQueue.length} />
                    <StatChip
                      label="Discharged"
                      value={ward.dischargedPatients?.length || 0}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="printable-report rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-6 flex items-start justify-between gap-3 print:hidden">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Patient Report
                  </p>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedPatient?.name || "No patient selected"}
                  </h3>
                </div>
                {selectedPatient && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Printer className="h-4 w-4" />
                    Save PDF
                  </button>
                )}
              </div>

              {patientSearch.trim() && filteredWardPatients.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  No patient matched &ldquo;{patientSearch.trim()}&rdquo; in
                  this ward.
                </p>
              ) : selectedPatient ? (
                <PatientReportLayout
                  patient={selectedPatient}
                  wardName={selectedWard?.name}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  No patient data available for the selected ward.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "bed" && (
        <section className="rounded-2xl bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Bed Report</h2>
              <p className="text-sm text-slate-500">
                Bed availability, occupancy, maintenance, and activity logs
                across wards
              </p>
            </div>
            {(role === "admin" || role === "consultant_doctor") && (
              <SummaryCard
                label="Queued Patients"
                value={hospitalSummary.queuedPatients}
                icon={<ClipboardList className="h-5 w-5" />}
              />
            )}
          </div>
          <div className="mb-6 flex flex-col gap-4 lg:flex-row print:hidden">
            <div className="w-full lg:max-w-md">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Select ward
              </label>
              <select
                value={selectedWard?.wardId || selectedWard?.id || ""}
                onChange={(event) => setSelectedWardId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              >
                {visibleWards.map((ward) => (
                  <option
                    key={ward.wardId || ward.id}
                    value={ward.wardId || ward.id}
                  >
                    {ward.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full lg:max-w-md">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Select bed
              </label>
              <select
                value={selectedBed?.id || ""}
                onChange={(event) => setSelectedBedId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
              >
                <option value="">Select a bed</option>
                {selectedWard?.beds.length ? (
                  selectedWard.beds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.type === "ICU"
                        ? `ICU Bed ${bed.bedNumber}`
                        : `Bed ${bed.bedNumber}`}{" "}
                      - {bed.status}
                    </option>
                  ))
                ) : (
                  <option value="">No beds available</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 print:hidden">
            {visibleWards.map((ward) => {
              const stats = countWardStats(ward);
              return (
                <div
                  key={`${ward.id}-beds`}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <h3 className="mb-3 font-semibold text-slate-900">
                    {ward.name}
                  </h3>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>Total beds: {stats.total}</p>
                    <p>Available beds: {stats.available}</p>
                    <p>Occupied beds: {stats.occupied}</p>
                    <p>Maintenance beds: {stats.maintenance}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedWard && selectedBed ? (
            <div className="printable-report mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-6 flex items-start justify-between gap-3 print:hidden">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Bed Report
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {selectedBed.type === "ICU"
                      ? `ICU Bed ${selectedBed.bedNumber}`
                      : `Bed ${selectedBed.bedNumber}`}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {selectedWard.name} &ndash;{" "}
                    {selectedWard.wardId || selectedWard.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" />
                  Save PDF
                </button>
              </div>

              <BedReportLayout bed={selectedBed} wardName={selectedWard.name} />
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              Select a bed to view and print its report.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Report layout components ─────────────────────────────────────────────────

function ReportDivider({ label }: { label: string }) {
  return (
    <div className="report-section mb-1 mt-5 flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function ReportFieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-row flex items-center justify-between gap-6 border-b border-slate-100 py-2.5 last:border-0">
      <span className="min-w-0 shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function ReportStatGrid({
  items,
}: {
  items: { label: string; value: string | number; accent?: boolean }[];
}) {
  return (
    <div className="report-stat-grid my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`rounded-xl border p-3 text-center ${
            item.accent
              ? "border-teal-200 bg-teal-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <p
            className={`text-2xl font-bold ${
              item.accent ? "text-teal-700" : "text-slate-900"
            }`}
          >
            {item.value}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "bg-emerald-100 text-emerald-800",
    occupied: "bg-blue-100 text-blue-800",
    maintenance: "bg-amber-100 text-amber-800",
    admitted: "bg-blue-100 text-blue-800",
    queued: "bg-amber-100 text-amber-800",
    discharged: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        map[status.toLowerCase()] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {status}
    </span>
  );
}

function ReportPrintHeader({
  title,
  subtitle,
  generatedAt,
}: {
  title: string;
  subtitle?: string;
  generatedAt: string;
}) {
  return (
    <div className="report-print-title mb-6 border-b-2 border-teal-600 pb-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-teal-700">
            Hospital Management System
          </p>
          <h2 className="mt-0.5 text-2xl font-bold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        <p className="text-right text-xs text-slate-400">{generatedAt}</p>
      </div>
    </div>
  );
}

// ─── Ward report layout ───────────────────────────────────────────────────────

function WardReportLayout({
  ward,
  stats,
}: {
  ward: Ward;
  stats: ReturnType<typeof countWardStats>;
}) {
  const now = new Date().toLocaleString();
  const occupancyPct =
    stats.total === 0 ? 0 : Math.round((stats.occupied / stats.total) * 100);

  return (
    <div className="space-y-1">
      <ReportPrintHeader
        title={ward.name}
        subtitle={`Ward ID: ${ward.wardId || ward.id}`}
        generatedAt={`Generated: ${now}`}
      />

      <ReportDivider label="Bed Summary" />
      <ReportStatGrid
        items={[
          { label: "Total Beds", value: stats.total },
          { label: "Available", value: stats.available, accent: true },
          { label: "Occupied", value: stats.occupied },
          { label: "Maintenance", value: stats.maintenance },
        ]}
      />

      <ReportDivider label="Patient Summary" />
      <ReportStatGrid
        items={[
          { label: "Admitted", value: stats.admitted, accent: true },
          { label: "Queued", value: stats.queued },
          { label: "Discharged", value: stats.discharged },
          { label: "Occupancy", value: `${occupancyPct}%` },
        ]}
      />

      <ReportDivider label="Ward Details" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Ward Name" value={ward.name} />
        <ReportFieldRow label="Ward ID" value={ward.wardId || ward.id} />
        <ReportFieldRow
          label="Queue Status"
          value={stats.queued > 0 ? `${stats.queued} waiting` : "No queue"}
        />
        <ReportFieldRow label="Occupancy Rate" value={`${occupancyPct}%`} />
        <ReportFieldRow label="Report Generated" value={now} />
      </div>
    </div>
  );
}

// ─── Patient report layout ────────────────────────────────────────────────────

function PatientReportLayout({
  patient,
  wardName,
}: {
  patient: Ward["patients"][number];
  wardName?: string;
}) {
  const now = new Date().toLocaleString();

  return (
    <div className="space-y-1">
      <ReportPrintHeader
        title={patient.name}
        subtitle={`Patient ID: ${patient.id}`}
        generatedAt={`Generated: ${now}`}
      />

      <div className="report-section mb-4 flex items-center gap-2">
        <StatusBadge status={patient.status || "unknown"} />
        <span className="text-xs text-slate-500">
          {wardName || patient.wardId || "Unknown ward"}
        </span>
      </div>

      <ReportDivider label="Demographics" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Full Name" value={patient.name} />
        <ReportFieldRow label="Patient ID" value={patient.id} />
        <ReportFieldRow label="Age" value={`${patient.age} years`} />
        <ReportFieldRow label="Age Group" value={patient.ageGroup} />
        <ReportFieldRow
          label="Gender"
          value={patient.gender || "Not specified"}
        />
      </div>

      <ReportDivider label="Clinical Information" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Diagnosis / Disease" value={patient.disease} />
        <ReportFieldRow label="Priority" value={patient.priority} />
        <ReportFieldRow
          label="Special Requirements"
          value={
            patient.specialRequirements?.length
              ? patient.specialRequirements.join(", ")
              : "None"
          }
        />
        <ReportFieldRow
          label="Transferred From"
          value={patient.assignedFromWardId || "N/A"}
        />
        <ReportFieldRow
          label="Ward"
          value={wardName || patient.wardId || "Unknown"}
        />
      </div>

      <ReportDivider label="Admission Timeline" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Status" value={patient.status || "Unknown"} />
        <ReportFieldRow
          label="Admission Time"
          value={
            patient.admissionTime
              ? new Date(patient.admissionTime).toLocaleString()
              : "Not available"
          }
        />
        <ReportFieldRow
          label="Discharge Time"
          value={
            patient.dischargeTime
              ? new Date(patient.dischargeTime).toLocaleString()
              : "Not yet discharged"
          }
        />
        <ReportFieldRow
          label="Queue Wait Time"
          value={
            typeof patient.queueWaitTime === "number"
              ? `${patient.queueWaitTime} min(s)`
              : "N/A"
          }
        />
        <ReportFieldRow label="Report Generated" value={now} />
      </div>
    </div>
  );
}

// ─── Bed report layout ────────────────────────────────────────────────────────

function getBedTimestamp(
  bed: Record<string, unknown>,
  key: "createdAt" | "updatedAt"
): string {
  const value = bed[key];
  if (!value) return "N/A";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

function BedReportLayout({
  bed,
  wardName,
}: {
  bed: Ward["beds"][number];
  wardName: string;
}) {
  const now = new Date().toLocaleString();
  const bedRecord = bed as unknown as Record<string, unknown> & {
    patient?: Ward["patients"][number];
    patientId?: string | null;
  };
  const patient = bedRecord.patient;
  const bedLabel =
    bed.type === "ICU" ? `ICU Bed ${bed.bedNumber}` : `Bed ${bed.bedNumber}`;
  const createdAt = getBedTimestamp(bedRecord, "createdAt");
  const updatedAt = getBedTimestamp(bedRecord, "updatedAt");

  return (
    <div className="space-y-1">
      <ReportPrintHeader
        title={bedLabel}
        subtitle={`${wardName} — Bed ID: ${bed.id}`}
        generatedAt={`Generated: ${now}`}
      />

      <div className="report-section mb-4">
        <StatusBadge status={bed.status} />
      </div>

      <ReportDivider label="Bed Details" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Bed Label" value={bedLabel} />
        <ReportFieldRow label="Bed ID" value={bed.id} />
        <ReportFieldRow label="Ward" value={wardName} />
        <ReportFieldRow label="Status" value={bed.status} />
        <ReportFieldRow label="Bed Status Since" value={createdAt} />
        <ReportFieldRow label="Last Updated" value={updatedAt} />
      </div>

      <ReportDivider label="Current Patient" />
      <div className="report-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow
          label="Patient Name"
          value={patient?.name || "No patient assigned"}
        />
        <ReportFieldRow
          label="Patient ID"
          value={patient?.id || (bedRecord.patientId as string) || "N/A"}
        />
        <ReportFieldRow
          label="Admission Time"
          value={
            patient?.admissionTime
              ? new Date(patient.admissionTime).toLocaleString()
              : "N/A"
          }
        />
        <ReportFieldRow
          label="Discharge Time"
          value={
            patient?.dischargeTime
              ? new Date(patient.dischargeTime).toLocaleString()
              : "N/A"
          }
        />
      </div>

      <ReportDivider label="Activity Log" />
      <div className="report-log-section rounded-xl border border-slate-200 bg-white px-4 py-1">
        <ReportFieldRow label="Bed created" value={createdAt} />
        <ReportFieldRow label="Current state updated" value={updatedAt} />
        <ReportFieldRow
          label="Admission recorded"
          value={
            patient?.admissionTime
              ? new Date(patient.admissionTime).toLocaleString()
              : "No admission recorded"
          }
        />
        <ReportFieldRow
          label="Discharge recorded"
          value={
            patient?.dischargeTime
              ? new Date(patient.dischargeTime).toLocaleString()
              : "No discharge recorded"
          }
        />
        <ReportFieldRow
          label="Current patient"
          value={patient?.name || "None"}
        />
        <ReportFieldRow label="Report Generated" value={now} />
      </div>
    </div>
  );
}

// ─── Shared UI helpers (unchanged) ───────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
        {icon}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
