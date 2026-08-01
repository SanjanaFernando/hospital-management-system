import { WardFormField, WardFormConfig } from "@/app/types";

export const DEFAULT_WARD_FORM_CONFIGS: Record<string, WardFormField[]> = {
  "ward-3": [
    {
      id: "bloodGroup",
      label: "Blood Group",
      type: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      placeholder: "Select blood group",
    },
    {
      id: "preOpFastingHours",
      label: "Pre-Op Fasting Hours",
      type: "number",
      required: false,
      placeholder: "e.g. 8",
    },
    {
      id: "surgicalHistory",
      label: "Past Surgical History",
      type: "textarea",
      required: false,
      placeholder: "Enter previous surgeries or procedures...",
    },
    {
      id: "emergencyContactPhone",
      label: "Emergency Contact Phone",
      type: "text",
      required: false,
      placeholder: "+94 77 123 4567",
    },
  ],
  "ward-4": [
    {
      id: "bloodGroup",
      label: "Blood Group",
      type: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      placeholder: "Select blood group",
    },
    {
      id: "allergyHistory",
      label: "Known Allergies (Medications / Food)",
      type: "textarea",
      required: false,
      placeholder: "e.g. Penicillin, Latex, Peanuts...",
    },
    {
      id: "anesthesiaConsent",
      label: "Anesthesia Consent Signed",
      type: "checkbox",
      required: false,
    },
    {
      id: "primarySurgeon",
      label: "Primary Surgeon Name",
      type: "text",
      required: false,
      placeholder: "Dr. K. Perera",
    },
  ],
  "ward-5": [
    {
      id: "bloodGroup",
      label: "Blood Group",
      type: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      placeholder: "Select blood group",
    },
    {
      id: "postOpCarePlan",
      label: "Post-Operative Care Instructions",
      type: "textarea",
      required: false,
      placeholder: "Special care instructions for recovery...",
    },
    {
      id: "oxygenSaturation",
      label: "Baseline Oxygen Saturation SpO2 (%)",
      type: "number",
      required: false,
      placeholder: "e.g. 98",
    },
    {
      id: "emergencyContactPhone",
      label: "Emergency Contact Phone",
      type: "text",
      required: false,
      placeholder: "+94 71 987 6543",
    },
  ],
  "ward-6": [
    {
      id: "bloodGroup",
      label: "Blood Group",
      type: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      placeholder: "Select blood group",
    },
    {
      id: "preExistingImplants",
      label: "Pre-existing Medical Implants / Prosthetics",
      type: "text",
      required: false,
      placeholder: "e.g. Pacemaker, Knee Replacement...",
    },
    {
      id: "mobilityStatus",
      label: "Patient Mobility Status",
      type: "select",
      required: false,
      options: ["Independent", "Assisted Walk", "Wheelchair", "Bedridden"],
      placeholder: "Select mobility status",
    },
    {
      id: "emergencyContactPhone",
      label: "Emergency Contact Phone",
      type: "text",
      required: false,
      placeholder: "+94 70 555 1234",
    },
  ],
};

export function getDefaultWardFields(wardId: string): WardFormField[] {
  const normalized = wardId.toLowerCase();
  if (normalized in DEFAULT_WARD_FORM_CONFIGS) {
    return DEFAULT_WARD_FORM_CONFIGS[normalized];
  }
  // Generic fallback if new ward
  return [
    {
      id: "bloodGroup",
      label: "Blood Group",
      type: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "Unknown"],
      placeholder: "Select blood group",
    },
    {
      id: "emergencyContactPhone",
      label: "Emergency Contact Phone",
      type: "text",
      required: false,
      placeholder: "+94 77 123 4567",
    },
    {
      id: "wardNotes",
      label: "Ward Admission Notes",
      type: "textarea",
      required: false,
      placeholder: "Special notes for this ward admission...",
    },
  ];
}
