import { getServerSession } from "@/lib/session.server";
import { canAccessWard } from "@/lib/rbac";
import {
  getWardWithPatientsData,
  getWardsWithPatientsData,
} from "@/lib/hospital-data";
import WardOverviewClient from "@/app/components/WardOverviewClient";

export default async function WardPage({
  params,
}: {
  params: Promise<{ wardId: string }>;
}) {
  const { wardId } = await params;
  const session = await getServerSession();
  const ward = await getWardWithPatientsData(wardId);

  if (!ward) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            Ward not found
          </h1>
          <p className="text-gray-600">
            The ward you requested does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (!canAccessWard(session, ward.wardId || ward.id)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
        <div className="mx-auto max-w-4xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            Access denied
          </h1>
          <p className="text-gray-600">
            Your role is assigned to a different ward. Switch ward scope from
            the role panel to continue.
          </p>
        </div>
      </div>
    );
  }

  const initialWards =
    session.role === "admin" || session.role === "consultant_doctor"
      ? await getWardsWithPatientsData()
      : [ward];

  return <WardOverviewClient initialWard={ward} initialWards={initialWards} />;
}
