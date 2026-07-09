import { Metadata } from "next";
import { getDailyPatientData, getDashboardData } from "@/lib/hospital-data";
import { getServerSession } from "@/lib/session.server";
import { canAccessWard } from "@/lib/rbac";
import DashboardCharts from "@/app/components/dashboard/DashboardChartsLoader";

export const metadata: Metadata = {
  title: "Hospital Bed Management System",
  description: "Real-time hospital bed availability and ward management",
  icons: {
    icon: "/hospital.svg",
  },
};

export default async function Home() {
  const session = await getServerSession();
  const isAdmin = session.role === "admin";
  const isAdminRole = session.role === "admin" || session.role === "sub_admin";
  const wardIdsKey = isAdminRole ? undefined : (session.wardIds || []).slice().sort().join(",");

  const [dashboardData, dailyPatientData] = await Promise.all([
    getDashboardData(),
    getDailyPatientData(wardIdsKey),
  ]);

  const visibleWards = dashboardData.wards.filter((ward) =>
    canAccessWard(session, ward.wardId)
  );

  const wardsForCards = isAdmin ? dashboardData.wards : visibleWards;
  
  // Sort wards: Assigned wards first, then other wards, sorted by occupancy
  const wardsSorted = [...wardsForCards].sort((left, right) => {
    const leftAssigned = session.wardIds?.includes(left.wardId) ? 1 : 0;
    const rightAssigned = session.wardIds?.includes(right.wardId) ? 1 : 0;

    if (leftAssigned !== rightAssigned) {
      return rightAssigned - leftAssigned; // Assigned first
    }

    const occupancyA =
      left.totalBeds === 0 ? 0 : left.occupiedBeds / left.totalBeds;
    const occupancyB =
      right.totalBeds === 0 ? 0 : right.occupiedBeds / right.totalBeds;
    return occupancyB - occupancyA;
  });

  const totalBeds = visibleWards.reduce((sum, ward) => sum + ward.totalBeds, 0);
  const totalAvailable = visibleWards.reduce(
    (sum, ward) => sum + ward.availableBeds,
    0
  );
  const totalOccupied = visibleWards.reduce(
    (sum, ward) => sum + ward.occupiedBeds,
    0
  );
  const totalMaintenance = visibleWards.reduce(
    (sum, ward) => sum + ward.maintenanceBeds,
    0
  );
  const totalQueue = visibleWards.reduce(
    (sum, ward) => sum + ward.queuedPatients,
    0
  );

  const totalAvailablePercent =
    totalBeds > 0 ? Math.round((totalAvailable / totalBeds) * 100) : 0;
  const totalOccupiedPercent =
    totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;
  const totalMaintenancePercent =
    totalBeds > 0 ? Math.round((totalMaintenance / totalBeds) * 100) : 0;

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-4 xl:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-gray-800">
            {isAdmin ? "Hospital Bed Management System" : "Ward Dashboard"}
          </h1>
          <p className="text-gray-600">
            {isAdmin
              ? "Real-time bed availability, patient details, and ward management"
              : "Role-based ward view with patient and bed operations for your assigned ward"}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-5">
          <div className="rounded-lg border-l-4 border-green-500 bg-white px-6 py-4 shadow-md">
            <p className="mb-2 text-sm text-gray-600">Available Beds</p>
            <p className="text-3xl font-bold text-green-600">
              {totalAvailable}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {totalAvailablePercent}% of total
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-blue-500 bg-white px-6 py-4 shadow-md">
            <p className="mb-2 text-sm text-gray-600">Occupied Beds</p>
            <p className="text-3xl font-bold text-blue-600">{totalOccupied}</p>
            <p className="mt-2 text-xs text-gray-500">
              {totalOccupiedPercent}% of total
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-yellow-500 bg-white px-6 py-4 shadow-md">
            <p className="mb-2 text-sm text-gray-600">Maintenance</p>
            <p className="text-3xl font-bold text-yellow-600">
              {totalMaintenance}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {totalMaintenancePercent}% of total
            </p>
          </div>
          <div className="rounded-lg border-l-4 border-purple-500 bg-white px-6 py-4 shadow-md">
            <p className="mb-2 text-sm text-gray-600">Waiting</p>
            <p className="text-3xl font-bold text-purple-600">{totalQueue}</p>
            <p className="mt-2 text-xs text-gray-500">In queue</p>
          </div>
          <div className="rounded-lg border-l-4 border-gray-500 bg-white px-6 py-4 shadow-md">
            <p className="mb-2 text-sm text-gray-600">Total Beds</p>
            <p className="text-3xl font-bold text-gray-600">{totalBeds}</p>
            <p className="mt-2 text-xs text-gray-500">
              {isAdmin ? "Across all wards" : "In your assigned ward"}
            </p>
          </div>
        </div>

        <DashboardCharts
          wards={visibleWards}
          dailyPatientData={dailyPatientData}
        />

        <div className="mt-8 rounded-lg bg-white p-8 shadow-md">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800">Wards</h2>
          </div>
          <div className="flex flex-col gap-6">
            {wardsSorted.map((ward) => (
              <div
                key={ward.id}
                className="rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-slate-900">
                        {ward.name}
                      </h3>
                      {session.wardIds?.includes(ward.wardId) && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          Assigned Ward
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{ward.wardId}</p>
                  </div>
                  <div className="flex justify-center md:justify-end w-full md:w-auto">
                    <a
                      href={`/wards/${ward.wardId}`}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Open ward
                    </a>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-green-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-green-700">
                      Available
                    </p>
                    <p className="mt-1 text-2xl font-bold text-green-700">
                      {ward.availableBeds}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-blue-700">
                      Occupied
                    </p>
                    <p className="mt-1 text-2xl font-bold text-blue-700">
                      {ward.occupiedBeds}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-yellow-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-yellow-700">
                      Maintenance
                    </p>
                    <p className="mt-1 text-2xl font-bold text-yellow-700">
                      {ward.maintenanceBeds}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-purple-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-purple-700">
                      In Queue
                    </p>
                    <p className="mt-1 text-2xl font-bold text-purple-700">
                      {ward.queuedPatients}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-slate-900"
                    style={{
                      width: `${ward.totalBeds === 0 ? 0 : Math.round((ward.occupiedBeds / ward.totalBeds) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
