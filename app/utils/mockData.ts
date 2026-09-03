import { Ward, Bed, Patient, AgeGroup, Priority, Gender } from "@/app/types";

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
    2026,
    8,
    4,
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60)
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
        gender: "Male" as const,
        patient,
      };
    }
    return {
      id: `ward16-${bedIndex}`,
      bedNumber,
      status: "available" as const,
      type: bedType,
      gender: "Male" as const,
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
  const wardConfigs = [
    {
      id: "ward-2",
      name: "Ward 2 - Pediatric",
      policy: "any" as const,
      icuBeds: 3,
      maleBeds: 33,
      maleAdmitted: 30,
      femaleBeds: 34,
      femaleAdmitted: 30,
      queueCount: 8,
    },
    {
      id: "ward-3",
      name: "Ward 3 - Surgical Female",
      policy: "Female" as const,
      icuBeds: 2,
      maleBeds: 0,
      maleAdmitted: 0,
      femaleBeds: 40,
      femaleAdmitted: 36,
      queueCount: 8,
    },
    {
      id: "ward-5",
      name: "Ward 5 - Surgical Male",
      policy: "Male" as const,
      icuBeds: 2,
      maleBeds: 50,
      maleAdmitted: 46,
      femaleBeds: 0,
      femaleAdmitted: 0,
      queueCount: 10,
    },
    {
      id: "ward-9",
      name: "Ward 9 - Surgical General",
      policy: "any" as const,
      icuBeds: 2,
      maleBeds: 22,
      maleAdmitted: 19,
      femaleBeds: 22,
      femaleAdmitted: 18,
      queueCount: 8,
    },
  ];

  return wardConfigs.map((cfg) => {
    const admittedPatients: Patient[] = [];
    const patientQueue: Patient[] = [];

    // Admitted male patients
    const malePatients: Patient[] = [];
    for (let i = 0; i < cfg.maleAdmitted; i++) {
      const p = generateMockPatient(`${cfg.id}-m-pt-${i}`);
      p.gender = "Male";
      p.wardId = cfg.id;
      p.status = "admitted";
      if (cfg.id === "ward-2") {
        p.age = Math.floor(Math.random() * 15) + 1;
        p.ageGroup = "Child";
      }
      malePatients.push(p);
      admittedPatients.push(p);
    }

    // Admitted female patients
    const femalePatients: Patient[] = [];
    for (let i = 0; i < cfg.femaleAdmitted; i++) {
      const p = generateMockPatient(`${cfg.id}-f-pt-${i}`);
      p.gender = "Female";
      p.wardId = cfg.id;
      p.status = "admitted";
      if (cfg.id === "ward-2") {
        p.age = Math.floor(Math.random() * 15) + 1;
        p.ageGroup = "Child";
      }
      femalePatients.push(p);
      admittedPatients.push(p);
    }

    // Queue patients
    for (let i = 0; i < cfg.queueCount; i++) {
      const p = generateMockPatient(`${cfg.id}-q-${i}`);
      p.gender =
        cfg.policy === "Female"
          ? "Female"
          : cfg.policy === "Male"
          ? "Male"
          : i % 2 === 0
          ? "Male"
          : "Female";
      p.wardId = cfg.id;
      p.status = "queued";
      if (cfg.id === "ward-2") {
        p.age = Math.floor(Math.random() * 15) + 1;
        p.ageGroup = "Child";
      }
      patientQueue.push(p);
    }

    const beds: Bed[] = [];
    let currentBedNumber = 1;

    // 1. ICU Beds (Unisex)
    for (let i = 1; i <= cfg.icuBeds; i++) {
      beds.push({
        id: `${cfg.id}-icu-${currentBedNumber}`,
        bedNumber: currentBedNumber,
        status: "available",
        type: "ICU",
        gender: "Unisex",
      });
      currentBedNumber++;
    }

    // 2. Male Beds (NORMAL, Male)
    for (let i = 0; i < cfg.maleBeds; i++) {
      const pt = malePatients[i] || null;
      beds.push({
        id: `${cfg.id}-normal-${currentBedNumber}`,
        bedNumber: currentBedNumber,
        status: pt ? "occupied" : "available",
        type: "NORMAL",
        gender: "Male",
        patient: pt || undefined,
      });
      currentBedNumber++;
    }

    // 3. Female Beds (NORMAL, Female)
    for (let i = 0; i < cfg.femaleBeds; i++) {
      const pt = femalePatients[i] || null;
      beds.push({
        id: `${cfg.id}-normal-${currentBedNumber}`,
        bedNumber: currentBedNumber,
        status: pt ? "occupied" : "available",
        type: "NORMAL",
        gender: "Female",
        patient: pt || undefined,
      });
      currentBedNumber++;
    }

    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
    const maintenanceBeds = beds.filter((b) => b.status === "maintenance").length;
    const availableBeds = beds.filter((b) => b.status === "available").length;

    return {
      id: cfg.id,
      wardId: cfg.id,
      name: cfg.name,
      beds,
      patients: admittedPatients,
      patientQueue,
      totalBeds: beds.length,
      occupiedBeds,
      availableBeds,
      maintenanceBeds,
    };
  });
}
