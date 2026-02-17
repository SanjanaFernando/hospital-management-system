"use client";

import { useState } from "react";
import { createPatient } from "@/app/utils/api";
import { Priority, AgeGroup } from "@/app/types";

interface PatientRegistrationFormProps {
  wardId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const diseases = [
  "Hypertension",
  "Diabetes",
  "Pneumonia",
  "Heart Disease",
  "Asthma",
  "Cancer",
  "Stroke",
  "Kidney Disease",
  "Liver Disease",
  "Arthritis",
  "Thyroid Disorder",
  "Tuberculosis",
  "Fever",
  "Fracture",
  "Infection",
];

const specialRequirements = [
  "Oxygen Support",
  "Dialysis",
  "Ventilator",
  "IV Drip",
  "Catheter",
  "Feeding Tube",
  "Physical Therapy",
  "Mental Health Support",
  "Pain Management",
  "Isolation Required",
];

export default function PatientRegistrationForm({
  wardId,
  onSuccess,
  onCancel,
}: PatientRegistrationFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    age: 0,
    disease: "Hypertension",
    priority: "Non-urgent" as Priority,
    specialRequirements: [] as string[],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "age" ? parseInt(value) || "" : value,
    }));
  };

  const handleSpecialRequirementsChange = (requirement: string) => {
    setFormData((prev) => ({
      ...prev,
      specialRequirements: prev.specialRequirements.includes(requirement)
        ? prev.specialRequirements.filter((r) => r !== requirement)
        : [...prev.specialRequirements, requirement],
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setErrorMessage("Patient name is required");
      return false;
    }
    if (formData.age < 1 || formData.age > 150) {
      setErrorMessage("Please enter a valid age (1-150)");
      return false;
    }
    return true;
  };

  const determineAgeGroup = (age: number): AgeGroup => {
    if (age < 13) return "Child";
    if (age < 60) return "Adult";
    return "Elderly";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const patientData = {
        id: `patient-${Date.now()}`,
        name: formData.name.trim(),
        age: formData.age,
        ageGroup: determineAgeGroup(formData.age),
        disease: formData.disease,
        priority: formData.priority,
        admissionTime: new Date(),
        specialRequirements:
          formData.specialRequirements.length > 0
            ? formData.specialRequirements
            : undefined,
        wardId,
        status: "queued",
      };

      await createPatient(patientData);
      setSuccessMessage(
        `${formData.name} has been registered successfully and added to the queue!`,
      );

      // Reset form
      setFormData({
        name: "",
        age: 0,
        disease: "Hypertension",
        priority: "Non-urgent",
        specialRequirements: [],
      });

      // Call onSuccess callback after a brief delay
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to register patient",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-blue-200 max-w-2xl relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 rounded-lg flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            {/* Smaller Medical Cross */}
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-3 border-transparent border-t-red-600 border-r-red-400 animate-spin" />
              <svg
                className="absolute inset-0 w-full h-full animate-pulse"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="40"
                  y="15"
                  width="20"
                  height="70"
                  fill="#DC2626"
                  rx="2"
                />
                <rect
                  x="15"
                  y="40"
                  width="70"
                  height="20"
                  fill="#DC2626"
                  rx="2"
                />
              </svg>
            </div>
            <p className="text-gray-700 font-semibold text-sm">
              Registering Patient...
            </p>
          </div>
        </div>
      )}
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Register New Patient
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Patient Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Enter patient full name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Age */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Age (years) *
          </label>
          <input
            type="number"
            name="age"
            value={formData.age}
            onChange={handleInputChange}
            placeholder="Enter age"
            min="1"
            max="150"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        {/* Disease */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Disease/Condition *
          </label>
          <select
            name="disease"
            value={formData.disease}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {diseases.map((disease) => (
              <option key={disease} value={disease}>
                {disease}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Priority Level *
          </label>
          <select
            name="priority"
            value={formData.priority}
            onChange={
              handleInputChange as React.ChangeEventHandler<HTMLSelectElement>
            }
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Non-urgent">Non-urgent</option>
            <option value="Urgent">Urgent</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        {/* Special Requirements */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Special Requirements (Select all that apply)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {specialRequirements.map((requirement) => (
              <label
                key={requirement}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.specialRequirements.includes(requirement)}
                  onChange={() => handleSpecialRequirementsChange(requirement)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{requirement}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm font-semibold">{errorMessage}</p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-700 text-sm font-semibold">
              {successMessage}
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {isLoading ? "Registering..." : "Register Patient"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-400 text-white px-6 py-3 rounded-lg hover:bg-gray-500 transition-colors font-semibold"
          >
            Cancel
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-500 mt-4">
        * Required fields. Patient will be added to the ward queue and assigned
        a bed based on availability.
      </p>
    </div>
  );
}
