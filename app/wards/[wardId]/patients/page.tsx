import { getServerSession } from "@/lib/session.server";
import { canAccessWard } from "@/lib/rbac";
import { getWardWithPatientsData } from "@/lib/hospital-data";
import WardPatientsClient from "@/app/components/WardPatientsClient";

export default async function WardPatientsPage({
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
        <div className="mx-auto max-w-5xl rounded-lg bg-white p-8 shadow-md">
          <h1 className="text-2xl font-bold text-gray-800">Ward not found</h1>
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
            Your role is scoped to a different ward.
          </p>
        </div>
      </div>
    );
  }

  return <WardPatientsClient initialWard={ward} />;
}
