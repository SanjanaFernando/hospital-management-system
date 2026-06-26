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
          body * {
            visibility: hidden !important;
          }

          .printable-report,
          .printable-report * {
            visibility: visible !important;
          }

          .printable-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
          }
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
            <div className="printable-report mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-4 flex items-start justify-between gap-3">
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
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  Save PDF
                </button>
              </div>

              <ReportTextBlock
                text={buildWardReportText(selectedWard, selectedWardStats)}
              />
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

            <div className="printable-report rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-4 flex items-start justify-between gap-3">
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
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 print:hidden"
                  >
                    <Printer className="h-4 w-4" />
                    Save PDF
                  </button>
                )}
              </div>

              {patientSearch.trim() && filteredWardPatients.length === 0 ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  No patient matched "{patientSearch.trim()}" in this ward.
                </p>
              ) : selectedPatient ? (
                <ReportTextBlock
                  text={buildPatientReportText(
                    selectedPatient,
                    selectedWard?.name
                  )}
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
            <div className="printable-report mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm print:border-0 print:bg-white print:p-0 print:shadow-none">
              <div className="mb-4 flex items-start justify-between gap-3">
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
                    {selectedWard.name} -{" "}
                    {selectedWard.wardId || selectedWard.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 print:hidden"
                >
                  <Printer className="h-4 w-4" />
                  Save PDF
                </button>
              </div>

              <div className="space-y-3">
                <ReportTextBlock
                  text={buildBedReportText(selectedBed, selectedWard.name)}
                />
              </div>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 text-right">{value}</p>
    </div>
  );
}

function LogRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-white px-4 py-3">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-right text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function getBedTimestamp(
  bed: Record<string, unknown>,
  key: "createdAt" | "updatedAt"
): string {
  const value = bed[key];
  if (!value) return "N/A";

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
}

function buildWardReportText(
  ward: Ward,
  stats: NonNullable<ReturnType<typeof countWardStats>>
): string {
  return [
    `Ward Report`,
    `Ward Name: ${ward.name}`,
    `Ward ID: ${ward.wardId || ward.id}`,
    `Total Beds: ${stats.total}`,
    `Available Beds: ${stats.available}`,
    `Occupied Beds: ${stats.occupied}`,
    `Maintenance Beds: ${stats.maintenance}`,
    `Admitted Patients: ${stats.admitted}`,
    `Queued Patients: ${stats.queued}`,
    `Discharged Patients: ${stats.discharged}`,
    `Current Occupancy: ${
      stats.total === 0 ? 0 : Math.round((stats.occupied / stats.total) * 100)
    }%`,
    `Queue Status: ${
      stats.queued > 0 ? `${stats.queued} waiting` : "No queue"
    }`,
  ].join("\n");
}

function buildPatientReportText(
  patient: Ward["patients"][number],
  wardName?: string
): string {
  return [
    `Patient Report`,
    `Patient Name: ${patient.name}`,
    `Patient ID: ${patient.id}`,
    `Ward: ${wardName || patient.wardId || "Unknown"}`,
    `Status: ${patient.status || "unknown"}`,
    `Age: ${patient.age} years`,
    `Age Group: ${patient.ageGroup}`,
    `Gender: ${patient.gender || "Not set"}`,
    `Disease: ${patient.disease}`,
    `Priority: ${patient.priority}`,
    `Admission Time: ${
      patient.admissionTime
        ? new Date(patient.admissionTime).toLocaleString()
        : "Not available"
    }`,
    `Discharge Time: ${
      patient.dischargeTime
        ? new Date(patient.dischargeTime).toLocaleString()
        : "Not discharged"
    }`,
    `Queue Wait Time: ${
      typeof patient.queueWaitTime === "number"
        ? `${patient.queueWaitTime} min(s)`
        : "Not available"
    }`,
    `Special Requirements: ${
      patient.specialRequirements?.length
        ? patient.specialRequirements.join(", ")
        : "None"
    }`,
    `Transferred From: ${patient.assignedFromWardId || "N/A"}`,
  ].join("\n");
}

function buildBedReportText(
  bed: Ward["beds"][number],
  wardName: string
): string {
  const bedRecord = bed as unknown as Record<string, unknown> & {
    patient?: Ward["patients"][number];
    patientId?: string | null;
  };
  const patient = bedRecord.patient;
  const bedCreatedAt = getBedTimestamp(bedRecord, "createdAt");
  const bedUpdatedAt = getBedTimestamp(bedRecord, "updatedAt");

  return [
    `Bed Report`,
    `Ward Name: ${wardName}`,
    `Bed ID: ${bed.id}`,
    `Bed Label: ${
      bed.type === "ICU" ? `ICU Bed ${bed.bedNumber}` : `Bed ${bed.bedNumber}`
    }`,
    `Status: ${bed.status}`,
    `Current Patient: ${patient?.name || "No patient assigned"}`,
    `Patient ID: ${patient?.id || bedRecord.patientId || "N/A"}`,
    `Admission Time: ${
      patient?.admissionTime
        ? new Date(patient.admissionTime).toLocaleString()
        : "N/A"
    }`,
    `Discharge Time: ${
      patient?.dischargeTime
        ? new Date(patient.dischargeTime).toLocaleString()
        : "N/A"
    }`,
    `Maintenance / Last Update: ${
      bed.status === "maintenance" ? bedUpdatedAt : bedUpdatedAt || bedCreatedAt
    }`,
    `Bed Status Since: ${bedCreatedAt || bedUpdatedAt}`,
    `Activity Log:`,
    `- Bed created: ${bedCreatedAt}`,
    `- Current state updated: ${bedUpdatedAt}`,
    `- Admission record: ${
      patient?.admissionTime
        ? new Date(patient.admissionTime).toLocaleString()
        : "No admission recorded"
    }`,
    `- Discharge record: ${
      patient?.dischargeTime
        ? new Date(patient.dischargeTime).toLocaleString()
        : "No discharge recorded"
    }`,
    `- Current patient: ${patient?.name || "None"}`,
  ].join("\n");
}

function ReportTextBlock({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-6 text-slate-800 shadow-sm">
      {text}
    </pre>
  );
}
