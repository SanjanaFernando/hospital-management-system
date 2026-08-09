import { Ward, Patient, AgeGroup, Priority, Gender } from "@/app/types";

const diseases = [
  "Hypertension",
  "Diabetes",
  "Pneumonia",
  "Fracture",
  "Appendicitis",
  "Stroke",
  "Heart Attack",
  "Infection",
  "Asthma",
  "COPD",
  "Cancer Treatment",
  "Post-Surgery Recovery",
  "Respiratory Distress",
  "Gastritis",
  "Kidney Stones",
];

const specialRequirements = [
  "Oxygen Support",
  "Dialysis",
  "Physical Therapy",
  "ICU Monitoring",
  "Pain Management",
  "Antibiotic IV",
  "Cardiac Monitoring",
  "Isolation Required",
  "Wheelchair Access",
  "Sign Language Interpreter",
];

const firstNames = [
  "John",
  "Emma",
  "Michael",
  "Sarah",
  "David",
  "Jessica",
  "Robert",
  "Ashley",
  "James",
  "Lauren",
  "William",
  "Megan",
  "Richard",
  "Nicole",
  "Joseph",
  "Amanda",
  "Thomas",
  "Jennifer",
  "Charles",
  "Lisa",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
];

const genders: Gender[] = ["Male", "Female"];

export function generateMockPatient(patientId: string): Patient {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const age = Math.floor(Math.random() * 85) + 5;

  let ageGroup: AgeGroup;
  if (age < 13) ageGroup = "Child";
  else if (age < 65) ageGroup = "Adult";
  else ageGroup = "Elderly";

  const priorityRand = Math.random();
  let priority: Priority;
  if (priorityRand < 0.08) priority = "Triage 1";
  else if (priorityRand < 0.2) priority = "Triage 2";
  else if (priorityRand < 0.4) priority = "Triage 3";
  else if (priorityRand < 0.7) priority = "Triage 4";
  else priority = "Triage 5";

  const admissionTime = new Date(
    Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
  );

  const queueWaitTime = Math.floor(Math.random() * 480) + 15; // 15 mins to 8 hours
  const gender = genders[Math.floor(Math.random() * genders.length)];

  const hasSpecialRequirements = Math.random() < 0.4;
  const patientSpecialRequirements = hasSpecialRequirements
    ? [
        specialRequirements[
          Math.floor(Math.random() * specialRequirements.length)
        ],
      ]
    : [];

  // 50% chance of discharge
  const isDischarged = Math.random() < 0.3;
  const dischargeTime = isDischarged
    ? new Date(
        admissionTime.getTime() + Math.random() * 25 * 24 * 60 * 60 * 1000
      )
    : undefined;

  let numericId = patientId.replace(/\D/g, "");
  if (!numericId || numericId.length < 4) {
    numericId = String(Math.floor(10000 + Math.random() * 90000));
  }

  const hasPrevious = Math.random() < 0.5;
  const prevDisease = hasPrevious
    ? [diseases[Math.floor(Math.random() * diseases.length)]]
    : [];

  return {
    id: numericId,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup,
    gender,
    disease: diseases[Math.floor(Math.random() * diseases.length)],
    previousDiseases: prevDisease,
    priority,
    admissionTime,
    dischargeTime,
    queueWaitTime,
    specialRequirements: patientSpecialRequirements,
  };
}

export function initializeWard16(): Ward {
  const ward16QueuePatients: Patient[] = [
    {
      id: "9140",
      name: "Patient 9140",
      age: 68,
      ageGroup: "Elderly",
      gender: "Male",
      disease: "Rash on Buttocks",
      previousDiseases: [],
      priority: "Triage 5",
      admissionTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
      queueWaitTime: 180,
      specialRequirements: [],
    },
    {
      id: "9141",
      name: "Patient 9141",
      age: 18,
      ageGroup: "Adult",
      gender: "Male",
      disease: "Chest Pain",
      previousDiseases: [],
      priority: "Triage 2",
      admissionTime: new Date(Date.now() - 4.5 * 60 * 60 * 1000),
      queueWaitTime: 270,
      specialRequirements: [],
    },
    {
      id: "9142",
      name: "Patient 9142",
      age: 73,
      ageGroup: "Elderly",
      gender: "Male",
      disease: "Transfer from WD 24/26",
      previousDiseases: [],
      priority: "Triage 4",
      admissionTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
      queueWaitTime: 60,
      specialRequirements: [],
    },
    {
      id: "9143",
      name: "Patient 9143",
      age: 20,
      ageGroup: "Adult",
      gender: "Male",
      disease: "Faintness / Vertigo",
      previousDiseases: [],
      priority: "Triage 3",
      admissionTime: new Date(Date.now() - 0.5 * 60 * 60 * 1000),
      queueWaitTime: 30,
      specialRequirements: [],
    },
    {
      id: "9144",
      name: "Patient 9144",
      age: 74,
      ageGroup: "Elderly",
      gender: "Male",
      disease: "Chest Pain",
      previousDiseases: [],
      priority: "Triage 1",
      admissionTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      queueWaitTime: 120,
      specialRequirements: [],
    },
    {
      id: "9145",
      name: "Patient 9145",
      age: 47,
      ageGroup: "Adult",
      gender: "Male",
      disease: "Fits",
      previousDiseases: [],
      priority: "Triage 1",
      admissionTime: new Date(Date.now() - 0.5 * 60 * 60 * 1000),
      queueWaitTime: 30,
      specialRequirements: [],
    },
    {
      id: "9146",
      name: "Patient 9146",
      age: 44,
      ageGroup: "Adult",
      gender: "Male",
      disease: "Chest Pain",
      previousDiseases: [],
      priority: "Triage 1",
      admissionTime: new Date(Date.now() - 0.5 * 60 * 60 * 1000),
      queueWaitTime: 30,
      specialRequirements: [],
    },
  ];

  // 39 occupied male beds
  const admittedPatients: Patient[] = Array.from({ length: 39 }, (_, i) => ({
    ...generateMockPatient(`ward16-patient-${i}`),
    gender: "Male" as const,
  }));

  // 40 beds: 39 occupied + 1 available
  const beds = Array.from({ length: 40 }, (_, bedIndex) => {
    const bedNumber = bedIndex + 1;
    const patient = admittedPatients[bedIndex];
    const bedType: "ICU" | "NORMAL" = Math.random() < 0.2 ? "ICU" : "NORMAL";
    if (patient) {
      return {
        id: `ward16-${bedIndex}`,
        bedNumber,
        status: "occupied" as const,
        type: bedType,
        patient,
      };
    }
    return {
      id: `ward16-${bedIndex}`,
      bedNumber,
      status: "available" as const,
      type: bedType,
    };
  });

  return {
    id: "ward-16",
    name: "Ward 16 - Male Medical",
    beds,
    patients: admittedPatients,
    patientQueue: ward16QueuePatients,
    totalBeds: 40,
    occupiedBeds: 39,
    availableBeds: 1,
    maintenanceBeds: 0,
  };
}

export function initializeWards(): Ward[] {
  const wardNames = [
    "Ward 3 - Surgical Type A",
    "Ward 4 - Surgical Type B",
    "Ward 5 - Surgical Type C",
    "Ward 6 - Surgical Type D",
  ];

  const wards: Ward[] = wardNames.map((name, wardIndex) => {
    // Generate main ward patients (currently admitted)
    const admittedPatients: Patient[] = [];
    const patientQueue: Patient[] = [];

    // Create 15-18 occupied beds with patients
    const occupiedCount = Math.floor(Math.random() * 3) + 15;

    for (let i = 0; i < occupiedCount; i++) {
      const patient = generateMockPatient(`ward${wardIndex}-patient-${i}`);
      admittedPatients.push(patient);
    }

    // Create 3-7 patients in queue
    const queueCount = Math.floor(Math.random() * 5) + 2;
    for (let i = 0; i < queueCount; i++) {
      const patient = generateMockPatient(`ward${wardIndex}-queue-${i}`);
      patientQueue.push(patient);
    }

    // Create beds
    const beds = Array.from({ length: 25 }, (_, bedIndex) => {
      const bedNumber = bedIndex + 1;
      const patient = admittedPatients[bedIndex];
      const isICU = Math.random() < 0.2; // 20% ICU beds
      const bedType: "ICU" | "NORMAL" = isICU ? "ICU" : "NORMAL";

      if (patient) {
        return {
          id: `${wardIndex}-${bedIndex}`,
          bedNumber,
          status: "occupied" as const,
          type: bedType,
          patient,
        };
      }

      // Random maintenance or available
      const isMaintenance = Math.random() < 0.08;
      return {
        id: `${wardIndex}-${bedIndex}`,
        bedNumber,
        status: isMaintenance
          ? ("maintenance" as const)
          : ("available" as const),
        type: bedType,
      };
    });

    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
    const maintenanceBeds = beds.filter(
      (b) => b.status === "maintenance"
    ).length;
    const availableBeds = beds.filter((b) => b.status === "available").length;

    return {
      id: `ward-${wardIndex}`,
      name,
      beds,
      patients: admittedPatients,
      patientQueue,
      totalBeds: 25,
      occupiedBeds,
      availableBeds,
      maintenanceBeds,
    };
  });

  // Append Ward 16
  wards.push(initializeWard16());
  return wards;
}
