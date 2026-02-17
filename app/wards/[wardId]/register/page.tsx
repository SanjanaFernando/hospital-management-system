"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import PatientRegistrationForm from "@/app/components/PatientRegistrationForm";

export default function RegisterPatientPage() {
  const params = useParams<{ wardId: string }>();
  const router = useRouter();
  const wardId = params?.wardId;

  const handleRegistrationSuccess = () => {
    router.push(`/wards/${wardId}`);
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
          <PatientRegistrationForm
            wardId={wardId}
            onSuccess={handleRegistrationSuccess}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
  );
}
