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
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={`/wards/${wardId}`}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
        </div>

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
