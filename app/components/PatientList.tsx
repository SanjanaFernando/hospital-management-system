import { Patient } from "@/app/types";

interface PatientListProps {
  title: string;
  patients: Patient[];
}

const priorityClasses = {
  Critical: "bg-red-100 text-red-800 border-red-200",
  Urgent: "bg-orange-100 text-orange-800 border-orange-200",
  "Non-urgent": "bg-blue-100 text-blue-800 border-blue-200",
};

export default function PatientList({ title, patients }: PatientListProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">{title}</h2>
      {patients.length === 0 ? (
        <p className="text-gray-500 text-sm">No patients to display.</p>
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => (
            <div
              key={patient.id}
              className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-gray-800">{patient.name}</p>
                <p className="text-sm text-gray-500">
                  {patient.age} yrs • {patient.disease}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full border ${priorityClasses[patient.priority]}`}
              >
                {patient.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
