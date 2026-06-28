"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PatientRegistrationForm from "@/app/components/PatientRegistrationForm";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canRegisterPatient } from "@/lib/rbac";

export default function RegisterPatientPage() {
  const params = useParams<{ wardId: string }>();
  const router = useRouter();
  const wardId = params?.wardId;
  const { session } = useAuthSession();

  const canRegister = canRegisterPatient(session, wardId);

  const handleRegistrationSuccess = () => {
    router.push(`/wards/${wardId}`);
    router.refresh();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href={`/wards/${wardId}`}
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft size={20} />
          Back to Ward
        </Link>

        <div className=" flex justify-center">
          {canRegister ? (
            <PatientRegistrationForm
              wardId={wardId}
              onSuccess={handleRegistrationSuccess}
              onCancel={handleCancel}
            />
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-red-200 max-w-2xl w-full">
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Access denied
              </h2>
              <p className="text-gray-600">
                Main Attendant cannot register patients.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
