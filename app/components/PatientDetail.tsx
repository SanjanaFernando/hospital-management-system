"use client";

import { useState } from "react";
import { Patient } from "@/app/types";
import DischargePatient from "./DischargePatient";

interface PatientDetailProps {
  patient: Patient;
  onDischargeSuccess?: () => void;
}

const priorityColors = {
  Critical: "bg-red-500",
  Urgent: "bg-orange-500",
  "Non-urgent": "bg-blue-500",
};

const ageGroupColors = {
  Child: "bg-purple-500",
  Adult: "bg-green-500",
  Elderly: "bg-pink-500",
};

export default function PatientDetail({
  patient,
  onDischargeSuccess,
}: PatientDetailProps) {
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const admissionDate = new Date(patient.admissionTime);
  const currentDate = new Date();
  const daysAdmitted = Math.floor(
    (currentDate.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (showDischargeForm) {
    return (
      <DischargePatient
        patientId={patient.id}
        patientName={patient.name}
        onSuccess={() => onDischargeSuccess?.()}
        onCancel={() => setShowDischargeForm(false)}
      />
    );
  }

  return (
    <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-800">{patient.name}</h3>
          <p className="text-gray-600 text-sm">Patient ID: {patient.id}</p>
        </div>
        <div className="flex gap-2">
          <span
            className={`${priorityColors[patient.priority]} text-white px-3 py-1 rounded-full text-sm font-semibold`}
          >
            {patient.priority}
          </span>
          <span
            className={`${ageGroupColors[patient.ageGroup]} text-white px-3 py-1 rounded-full text-sm font-semibold`}
          >
            {patient.ageGroup}
          </span>
          <button
            onClick={() => setShowDischargeForm(true)}
            className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold hover:bg-red-600 transition-colors"
          >
            Discharge
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Age</p>
          <p className="text-lg font-semibold text-gray-800">
            {patient.age} years
          </p>
        </div>
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Disease/Condition</p>
          <p className="text-lg font-semibold text-gray-800">
            {patient.disease}
          </p>
        </div>
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Admission Date & Time</p>
          <p className="text-sm font-semibold text-gray-800">
            {admissionDate.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded p-3 border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Days in Hospital</p>
          <p className="text-lg font-semibold text-gray-800">
            {daysAdmitted} day(s)
          </p>
        </div>
        {patient.queueWaitTime && (
          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Queue Wait Time</p>
            <p className="text-lg font-semibold text-gray-800">
              {patient.queueWaitTime} min(s)
            </p>
          </div>
        )}
        {patient.dischargeTime && (
          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Discharge Date & Time</p>
            <p className="text-sm font-semibold text-gray-800">
              {new Date(patient.dischargeTime).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {patient.specialRequirements &&
        patient.specialRequirements.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-sm font-semibold text-yellow-800 mb-2">
              Special Requirements
            </p>
            <div className="flex flex-wrap gap-2">
              {patient.specialRequirements.map((req, index) => (
                <span
                  key={index}
                  className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium"
                >
                  {req}
                </span>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
