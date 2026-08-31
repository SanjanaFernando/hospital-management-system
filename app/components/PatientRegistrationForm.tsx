import { useState, useEffect } from "react";
import { createPatient } from "@/app/utils/api";
import { Priority, AgeGroup, WardFormField, Gender, Ward } from "@/app/types";
import { useAuthSession } from "@/app/context/AuthSessionContext";
import { canRegisterPatient, canSetTriage, canManageStaff } from "@/lib/rbac";
import { getWardFormConfig } from "@/app/actions/wardFormActions";
import { getWardWithPatients } from "@/app/actions/wardActions";
import WardFormEditorModal from "@/app/components/WardFormEditorModal";
import { Settings2, Edit3, Lock } from "lucide-react";

interface PatientRegistrationFormProps {
  wardId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type WardGenderPolicy = "Male" | "Female" | "any";

import {
  searchExistingPatients,
  ExistingPatientSearchResult,
} from "@/app/actions/patientActions";

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

const commonPreviousDiseases = [
  "Hypertension",
  "Diabetes",
  "Asthma",
  "Heart Disease",
  "Kidney Disease",
  "Stroke",
  "Cancer",
  "Thyroid Disorder",
  "Arthritis",
  "Tuberculosis",
];

export default function PatientRegistrationForm({
  wardId,
  onSuccess,
  onCancel,
}: PatientRegistrationFormProps) {
  const { session } = useAuthSession();
  const isAdminOrSubAdmin = canManageStaff(session);

  const [formData, setFormData] = useState({
    patientId: String(Math.floor(10000 + Math.random() * 90000)),
    name: "",
    age: 0,
    gender: "Male" as Gender,
    disease: "Hypertension",
    previousDiseases: [] as string[],
    customPreviousDisease: "",
    priority: "Triage 5" as Priority,
    specialRequirements: [] as string[],
  });

  const [wardGenderPolicy, setWardGenderPolicy] = useState<WardGenderPolicy>("any");
  const [wardInfo, setWardInfo] = useState<Ward | null>(null);

  const [wardFields, setWardFields] = useState<WardFormField[]>([]);
  const [customFieldsData, setCustomFieldsData] = useState<Record<string, any>>({});
  const [showEditorModal, setShowEditorModal] = useState(false);

  const [searchResults, setSearchResults] = useState<ExistingPatientSearchResult[]>([]);
  const [idSearchResults, setIdSearchResults] = useState<ExistingPatientSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedReturningPatient, setSelectedReturningPatient] =
    useState<ExistingPatientSearchResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canRegister = canRegisterPatient(session, wardId);
  const triageEditable = canSetTriage(session, wardId);

  const loadWardConfigAndGender = () => {
    if (wardId) {
      getWardFormConfig(wardId).then((fields) => {
        setWardFields(fields);
      });

      getWardWithPatients(wardId).then((w) => {
        if (!w) return;
        setWardInfo(w);
        const name = (w.name || "").toLowerCase();
        let policy: WardGenderPolicy = "any";

        if (name.includes("female") || name.includes("maternity") || name.includes("gyn")) {
          policy = "Female";
        } else if (name.includes("male") && !name.includes("female")) {
          policy = "Male";
        } else {
          // Check non-unisex beds
          const designatedBeds = (w.beds || []).filter(
            (b) => b.gender && b.gender !== "Unisex"
          );
          if (designatedBeds.length > 0) {
            const hasMaleBeds = designatedBeds.some((b) => b.gender === "Male");
            const hasFemaleBeds = designatedBeds.some((b) => b.gender === "Female");
            if (hasMaleBeds && !hasFemaleBeds) policy = "Male";
            else if (hasFemaleBeds && !hasMaleBeds) policy = "Female";
          }
        }

        setWardGenderPolicy(policy);
        if (policy !== "any") {
          setFormData((prev) => ({ ...prev, gender: policy }));
        }
      });
    }
  };

  useEffect(() => {
    loadWardConfigAndGender();
  }, [wardId]);

  const handleCustomFieldChange = (fieldId: string, val: any) => {
    setCustomFieldsData((prev) => ({
      ...prev,
      [fieldId]: val,
    }));
  };

  const selectReturningPatient = (patient: ExistingPatientSearchResult) => {
    setSelectedReturningPatient(patient);
    const combinedDiseases = Array.from(
      new Set(
        [...patient.previousDiseases, patient.disease].filter(Boolean)
      )
    );

    const patGender: Gender =
      patient.gender === "Female" || String(patient.gender).toLowerCase() === "female"
        ? "Female"
        : "Male";

    setFormData((prev) => ({
      ...prev,
      patientId: patient.id,
      name: patient.name,
      age: patient.age || prev.age,
      gender: wardGenderPolicy !== "any" ? wardGenderPolicy : patGender,
      previousDiseases: combinedDiseases,
    }));
    setSearchResults([]);
    setIdSearchResults([]);
  };

  const handlePatientIdChange = async (idVal: string) => {
    setFormData((prev) => ({ ...prev, patientId: idVal }));
    const trimmed = idVal.trim();
    if (trimmed.length >= 2) {
      try {
        const results = await searchExistingPatients(trimmed);
        setIdSearchResults(results);
        const exactMatch = results.find((p) => p.id === trimmed);
        if (exactMatch) {
          selectReturningPatient(exactMatch);
        }
      } catch {
        // Ignore errors
      }
    } else {
      setIdSearchResults([]);
    }
  };

  const handlePatientIdBlur = async () => {
    const trimmed = formData.patientId.trim();
    if (trimmed.length >= 2 && !selectedReturningPatient) {
      try {
        const results = await searchExistingPatients(trimmed);
        const exactMatch = results.find((p) => p.id === trimmed);
        if (exactMatch) {
          selectReturningPatient(exactMatch);
        }
      } catch {
        // Ignore errors
      }
    }
  };

  const handleNameChange = async (nameVal: string) => {
    setFormData((prev) => ({ ...prev, name: nameVal }));
    setSelectedReturningPatient(null);
    if (nameVal.trim().length >= 2) {
      setIsSearching(true);
      try {
        const results = await searchExistingPatients(nameVal.trim());
        setSearchResults(results);
      } catch {
        // Ignore errors
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name === "name") {
      void handleNameChange(value);
      return;
    }
    if (name === "patientId") {
      void handlePatientIdChange(value);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: name === "age" ? parseInt(value) || "" : value,
    }));
  };

  const handlePreviousDiseaseToggle = (disease: string) => {
    setFormData((prev) => ({
      ...prev,
      previousDiseases: prev.previousDiseases.includes(disease)
        ? prev.previousDiseases.filter((d) => d !== disease)
        : [...prev.previousDiseases, disease],
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
    if (!formData.patientId.trim() || !/^\d+$/.test(formData.patientId.trim())) {
      setErrorMessage("Patient ID must be a numerical value (digits only, e.g. 10024)");
      return false;
    }
    if (!formData.name.trim()) {
      setErrorMessage("Patient name is required");
      return false;
    }
    if (!formData.gender) {
      setErrorMessage("Patient gender is required");
      return false;
    }
    if (formData.age < 1 || formData.age > 150) {
      setErrorMessage("Please enter a valid age (1-150)");
      return false;
    }

    // Validate required custom fields
    for (const field of wardFields) {
      if (field.required) {
        const val = customFieldsData[field.id];
        if (
          val === undefined ||
          val === null ||
          (typeof val === "string" && !val.trim())
        ) {
          setErrorMessage(`"${field.label}" is required for this ward.`);
          return false;
        }
      }
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

    if (!canRegister) {
      setErrorMessage("Main Attendant cannot register patients.");
      return;
    }

    setIsLoading(true);

    try {
      const allPrevious = [...formData.previousDiseases];
      if (formData.customPreviousDisease.trim()) {
        allPrevious.push(formData.customPreviousDisease.trim());
      }

      const patientData = {
        id: formData.patientId.trim(),
        name: formData.name.trim(),
        age: formData.age,
        ageGroup: determineAgeGroup(formData.age),
        gender: formData.gender,
        disease: formData.disease,
        previousDiseases: allPrevious.length > 0 ? allPrevious : undefined,
        priority: triageEditable ? formData.priority : "Triage 5",
        triageRequested: !triageEditable,
        admissionTime: new Date(),
        specialRequirements:
          formData.specialRequirements.length > 0
            ? formData.specialRequirements
            : undefined,
        customFields:
          Object.keys(customFieldsData).length > 0 ? customFieldsData : undefined,
        wardId,
        status: "queued",
      };

      await createPatient(patientData, session);
      setSuccessMessage(
        `${formData.name} (ID: #${patientData.id}) has been registered successfully!`
      );

      // Reset form with new auto-generated numeric ID and correct ward gender
      setFormData({
        patientId: String(Math.floor(10000 + Math.random() * 90000)),
        name: "",
        age: 0,
        gender: wardGenderPolicy === "Female" ? "Female" : "Male",
        disease: "Hypertension",
        previousDiseases: [],
        customPreviousDisease: "",
        priority: "Triage 5",
        specialRequirements: [],
      });

      onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to register patient"
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
        {/* Patient ID */}
        <div className="relative">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Patient ID (Numeric) *
          </label>
          <input
            type="text"
            name="patientId"
            value={formData.patientId}
            onChange={handleInputChange}
            onBlur={() => void handlePatientIdBlur()}
            placeholder="e.g. 10024 (type previous ID to auto-fill)"
            pattern="\d+"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
            required
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-gray-500">
            Type previous Patient ID to auto-fill returning patient details.
          </p>

          {/* Returning Patient Auto-complete Dropdown for ID */}
          {idSearchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-blue-300 rounded-lg shadow-xl max-h-56 overflow-y-auto">
              <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-200 text-xs font-semibold text-blue-900">
                🔍 Matching Patient ID Records (Click to auto-fill details):
              </div>
              {idSearchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectReturningPatient(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-sm text-gray-900">#{p.id} - {p.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({p.age} yrs)</span>
                    <p className="text-xs text-purple-700 mt-0.5">
                      Past Diagnoses: {p.previousDiseases.length > 0 ? p.previousDiseases.join(", ") : p.disease || "None"}
                    </p>
                  </div>
                  <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded text-xs font-bold shrink-0">
                    Auto-Fill
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="relative">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Patient Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Type patient full name (returning patients will auto-match)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            autoComplete="off"
          />

          {/* Returning Patient Auto-complete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-white border border-blue-300 rounded-lg shadow-xl max-h-56 overflow-y-auto">
              <div className="bg-blue-50 px-3 py-1.5 border-b border-blue-200 text-xs font-semibold text-blue-900">
                🔍 Matching Existing Patients (Click to reuse Patient ID & Medical History):
              </div>
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectReturningPatient(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-gray-100 last:border-0 transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-sm text-gray-900">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({p.age} yrs)</span>
                    <p className="text-xs text-purple-700 mt-0.5">
                      Past Diagnoses: {p.previousDiseases.length > 0 ? p.previousDiseases.join(", ") : p.disease || "None"}
                    </p>
                  </div>
                  <span className="bg-purple-100 text-purple-900 px-2.5 py-1 rounded font-mono text-xs font-bold shrink-0">
                    ID #{p.id}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Returning Patient Banner */}
          {selectedReturningPatient && (
            <div className="mt-2 flex items-center justify-between bg-purple-50 border border-purple-300 rounded-lg px-3 py-2 text-xs text-purple-900">
              <div>
                <span className="font-bold">🔄 Returning Patient Selected:</span> Reusing Patient ID{" "}
                <span className="font-mono font-bold">#{selectedReturningPatient.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturningPatient(null)}
                className="text-purple-700 hover:text-purple-900 font-bold ml-2 underline"
              >
                Clear
              </button>
            </div>
          )}

          {/* Returning Patient Gender Mismatch Warning */}
          {selectedReturningPatient &&
            wardGenderPolicy !== "any" &&
            selectedReturningPatient.gender &&
            selectedReturningPatient.gender !== wardGenderPolicy && (
              <div className="mt-2 p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
                <span className="text-amber-600 font-bold">⚠️ Notice:</span>
                <div>
                  Patient #{selectedReturningPatient.id} ({selectedReturningPatient.name}) was registered as{" "}
                  <span className="font-bold">{selectedReturningPatient.gender}</span>, but this ward only admits{" "}
                  <span className="font-bold">{wardGenderPolicy}</span> patients. Gender is locked to{" "}
                  <span className="font-bold">{wardGenderPolicy}</span>.
                </div>
              </div>
            )}
        </div>

        {/* Gender Selection / Locked Display */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Gender *
            </label>
            {wardGenderPolicy !== "any" && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Lock className="w-3 h-3 text-amber-600" />
                Locked to {wardGenderPolicy} (Ward Policy)
              </span>
            )}
          </div>

          {wardGenderPolicy !== "any" ? (
            <div>
              <div
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm ${
                  formData.gender === "Male"
                    ? "bg-blue-50/80 border-blue-400 text-blue-900"
                    : "bg-pink-50/80 border-pink-400 text-pink-900"
                }`}
              >
                <Lock className="w-4 h-4 text-slate-500" />
                <span>{formData.gender === "Male" ? "♂ Male (Ward Locked)" : "♀ Female (Ward Locked)"}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {wardInfo?.name || `Ward ${wardId}`} is dedicated for {wardGenderPolicy} patients only.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, gender: "Male" }))}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all cursor-pointer ${
                  formData.gender === "Male"
                    ? "bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-300"
                    : "bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                <span>♂ Male</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, gender: "Female" }))}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all cursor-pointer ${
                  formData.gender === "Female"
                    ? "bg-pink-500 border-pink-500 text-white shadow-sm ring-2 ring-pink-300"
                    : "bg-white border-gray-300 text-gray-700 hover:border-pink-400 hover:bg-pink-50"
                }`}
              >
                <span>♀ Female</span>
              </button>
            </div>
          )}
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

        {/* Disease / Current Condition */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Current Disease/Condition *
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

        {/* Previous Diseases / Medical History */}
        <div className="bg-purple-50/70 border border-purple-200 rounded-lg p-4">
          <label className="block text-sm font-semibold text-purple-900 mb-1">
            Previous Diseases / Medical History
          </label>
          <p className="text-xs text-purple-700 mb-3">
            Select any prior medical conditions or diagnoses this patient has had:
          </p>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {commonPreviousDiseases.map((disease) => (
              <label
                key={disease}
                className="flex items-center space-x-2 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={formData.previousDiseases.includes(disease)}
                  onChange={() => handlePreviousDiseaseToggle(disease)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-xs font-medium text-purple-900">{disease}</span>
              </label>
            ))}
          </div>

          <div className="mt-2">
            <input
              type="text"
              name="customPreviousDisease"
              value={formData.customPreviousDisease}
              onChange={handleInputChange}
              placeholder="Other previous disease / medical history (optional)"
              className="w-full px-3 py-1.5 border border-purple-200 rounded text-xs text-black focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            />
          </div>
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
            disabled={!triageEditable}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          >
            <option value="Triage 1">Triage 1 (Resuscitation)</option>
            <option value="Triage 2">Triage 2 (Emergency)</option>
            <option value="Triage 3">Triage 3 (Urgent)</option>
            <option value="Triage 4">Triage 4 (Less Urgent)</option>
            <option value="Triage 5">Triage 5 (Non-Urgent)</option>
          </select>
          {!triageEditable && (
            <p className="mt-2 text-xs text-amber-700">
              Triage level can only be set by Consultant Doctor. This patient
              will be marked as pending doctor triage.
            </p>
          )}
        </div>

        {/* Ward-Specific Custom Fields */}
        {wardFields.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">
                Ward Specific Details ({wardId.toUpperCase()})
              </p>
              {isAdminOrSubAdmin && (
                <button
                  type="button"
                  onClick={() => setShowEditorModal(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md transition"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit Ward Form Fields
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {wardFields.map((field) => (
                <div
                  key={field.id}
                  className={field.type === "textarea" ? "sm:col-span-2" : ""}
                >
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={customFieldsData[field.id] || ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      required={field.required}
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      value={customFieldsData[field.id] || ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      required={field.required}
                    />
                  )}

                  {field.type === "select" && (
                    <select
                      value={customFieldsData[field.id] || ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      required={field.required}
                    >
                      <option value="">{field.placeholder || `-- Select ${field.label} --`}</option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "checkbox" && (
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={Boolean(customFieldsData[field.id])}
                        onChange={(e) => handleCustomFieldChange(field.id, e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-700 font-medium">Yes / Confirmed</span>
                    </label>
                  )}

                  {field.type === "textarea" && (
                    <textarea
                      rows={3}
                      value={customFieldsData[field.id] || ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      required={field.required}
                    />
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      value={customFieldsData[field.id] || ""}
                      onChange={(e) => handleCustomFieldChange(field.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                      required={field.required}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* Ward Form Config Editor Trigger for Admins */}
        {isAdminOrSubAdmin && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Admin Control: Edit fields for {wardId.toUpperCase()}</span>
            <button
              type="button"
              onClick={() => setShowEditorModal(true)}
              className="inline-flex items-center gap-1.5 font-semibold text-teal-700 hover:text-teal-900 underline"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Form Schema Editor
            </button>
          </div>
        )}

        {/* Ward Form Editor Modal */}
        {showEditorModal && (
          <WardFormEditorModal
            wardId={wardId}
            wardName={`Ward ${wardId}`}
            isOpen={showEditorModal}
            onClose={() => setShowEditorModal(false)}
            onSaved={() => loadWardConfigAndGender()}
          />
        )}

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
            disabled={isLoading || !canRegister}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {!canRegister
              ? "Registration Not Allowed"
              : isLoading
                ? "Registering..."
                : "Register Patient"}
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
