// scripts/seedDatabase.mjs
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

function loadMongoUri() {
  // Priority 1: Environment variable
  if (process.env.MONGODB_URI) {
    console.log("✅ Loaded MONGODB_URI from process.env");
    return process.env.MONGODB_URI.trim();
  }

  // Priority 2: Read from .env.local
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local file not found!");
  }

  const envRaw = fs.readFileSync(envPath, "utf-8");
  const lines = envRaw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("MONGODB_URI=")) {
      let uri = trimmed.replace("MONGODB_URI=", "").trim();

      // Remove surrounding quotes if present
      uri = uri.replace(/^["']|["']$/g, "");

      console.log("✅ Loaded MONGODB_URI from .env.local");
      console.log("Connection string prefix:", uri.substring(0, 70) + "...");
      return uri;
    }
  }

  throw new Error("MONGODB_URI not found in .env.local");
}

// ==================== Rest of the script (unchanged) ====================

const TRIAGE_LEVELS = [
  "Triage 1",
  "Triage 2",
  "Triage 3",
  "Triage 4",
  "Triage 5",
];

const DISEASES = [
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

const SPECIAL_REQUIREMENTS = [
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

const FIRST_NAMES = [
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

const LAST_NAMES = [
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function generatePriority() {
  const roll = Math.random();
  if (roll < 0.08) return TRIAGE_LEVELS[0];
  if (roll < 0.2) return TRIAGE_LEVELS[1];
  if (roll < 0.4) return TRIAGE_LEVELS[2];
  if (roll < 0.7) return TRIAGE_LEVELS[3];
  return TRIAGE_LEVELS[4];
}

function ageGroupFromAge(age) {
  if (age < 13) return "Child";
  if (age < 60) return "Adult";
  return "Elderly";
}

let patientCounter = 10001;

// ---------------------------------------------------------------------------
// Ward 16 – Male Medical: fixed queue patients from the PDF
// ---------------------------------------------------------------------------
const WARD16_QUEUE_PATIENTS = [
  { id: "9140", name: "Patient 9140", age: 68, ageGroup: "Elderly", disease: "Rash on Buttocks",        waitHours: 3,   priority: "Triage 5" },
  { id: "9141", name: "Patient 9141", age: 18, ageGroup: "Adult",   disease: "Chest Pain",              waitHours: 4.5, priority: "Triage 2" },
  { id: "9142", name: "Patient 9142", age: 73, ageGroup: "Elderly", disease: "Transfer from WD 24/26",  waitHours: 1,   priority: "Triage 4" },
  { id: "9143", name: "Patient 9143", age: 20, ageGroup: "Adult",   disease: "Faintness / Vertigo",     waitHours: 0.5, priority: "Triage 3" },
  { id: "9144", name: "Patient 9144", age: 74, ageGroup: "Elderly", disease: "Chest Pain",              waitHours: 2,   priority: "Triage 2" },
  { id: "9145", name: "Patient 9145", age: 47, ageGroup: "Adult",   disease: "Fits",                   waitHours: 0.5, priority: "Triage 1" },
  { id: "9146", name: "Patient 9146", age: 44, ageGroup: "Adult",   disease: "Chest Pain",              waitHours: 0.5, priority: "Triage 1" },
];

function generatePatient(patientId, wardId, status) {
  const firstName = randomItem(FIRST_NAMES);
  const lastName = randomItem(LAST_NAMES);
  const age = randomInt(5, 90);
  const admissionTime = new Date(
    Date.now() - randomInt(5, 72) * 60 * 60 * 1000
  );

  const includeRequirements = Math.random() < 0.35;
  const requirements = includeRequirements
    ? [randomItem(SPECIAL_REQUIREMENTS)]
    : undefined;

  const hasPrevDiseases = Math.random() < 0.6;
  const previousDiseases = hasPrevDiseases
    ? [randomItem(DISEASES)]
    : [];

  const numericId = String(patientCounter++);

  return {
    id: numericId,
    wardId,
    status,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup: ageGroupFromAge(age),
    gender: Math.random() < 0.5 ? "Male" : "Female",
    disease: randomItem(DISEASES),
    previousDiseases,
    priority: generatePriority(),
    admissionTime,
    queueWaitTime: randomInt(10, 480),
    specialRequirements: requirements,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function resetDatabase() {
  const mongoUri = loadMongoUri();

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    retryWrites: false,
  });

  try {
    await client.connect();
    const db = client.db("hospital-management");

    console.log("🗑️ Clearing existing data...");
    await Promise.all([
      db.collection("wards").deleteMany({}),
      db.collection("beds").deleteMany({}),
      db.collection("patients").deleteMany({}),
    ]);

    const wardConfigs = [
      {
        wardId: "ward-3",
        name: "Ward 3 - Surgical",
        normalBeds: 32,
        icuBeds: 5,
        occupiedRate: 0.68,
        maintenanceBeds: 2,
        queuePatients: 11,
      },
      {
        wardId: "ward-4",
        name: "Ward 4 - Surgical",
        normalBeds: 30,
        icuBeds: 6,
        occupiedRate: 0.62,
        maintenanceBeds: 2,
        queuePatients: 9,
      },
      {
        wardId: "ward-5",
        name: "Ward 5 - Surgical",
        normalBeds: 44,
        icuBeds: 4,
        occupiedRate: 0.7,
        maintenanceBeds: 2,
        queuePatients: 14,
      },
      {
        wardId: "ward-6",
        name: "Ward 6 - Surgical",
        normalBeds: 28,
        icuBeds: 8,
        occupiedRate: 0.65,
        maintenanceBeds: 2,
        queuePatients: 10,
      },
      {
        wardId: "ward-16",
        name: "Ward 16 - Male Medical",
        normalBeds: 40,
        icuBeds: 0,
        occupiedRate: 0.975, // 39 of 40
        maintenanceBeds: 0,
        queuePatients: 0, // handled separately via WARD16_QUEUE_PATIENTS
      },
    ];

    let totalPatients = 0;
    let totalBeds = 0;

    for (const wardConfig of wardConfigs) {
      const wardId = wardConfig.wardId;
      const wardName = wardConfig.name;
      const normalBeds = wardConfig.normalBeds;
      const icuBeds = wardConfig.icuBeds;
      const bedCount = normalBeds + icuBeds;
      const occupiedBeds = Math.max(
        1,
        Math.min(
          bedCount - wardConfig.maintenanceBeds,
          Math.round(bedCount * wardConfig.occupiedRate)
        )
      );
      const queuePatients = wardConfig.queuePatients;

      const admitted = [];
      const queued = [];
      const beds = [];

      for (let i = 0; i < occupiedBeds; i++) {
        const patientId = `${wardId}-admitted-${i + 1}`;
        const p = generatePatient(patientId, wardId, "admitted");
        // Ward 16 is a Male-only ward
        if (wardId === "ward-16") p.gender = "Male";
        admitted.push(p);
      }

      // Ward 16 queue is seeded from the fixed list below
      if (wardId !== "ward-16") {
        for (let i = 0; i < queuePatients; i++) {
          const patientId = `${wardId}-queue-${i + 1}`;
          queued.push(generatePatient(patientId, wardId, "queued"));
        }
      } else {
        for (const pDef of WARD16_QUEUE_PATIENTS) {
          queued.push({
            id: pDef.id,
            wardId,
            status: "queued",
            name: pDef.name,
            age: pDef.age,
            ageGroup: pDef.ageGroup,
            gender: "Male",
            disease: pDef.disease,
            previousDiseases: [],
            priority: pDef.priority,
            admissionTime: new Date(Date.now() - pDef.waitHours * 60 * 60 * 1000),
            queueWaitTime: Math.round(pDef.waitHours * 60),
            specialRequirements: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      const bedBlueprints = [];
      for (let bedNumber = 1; bedNumber <= normalBeds; bedNumber++) {
        bedBlueprints.push({
          bedId: `${wardId}-normal-${bedNumber}`,
          bedNumber,
          type: "NORMAL",
        });
      }
      for (let bedNumber = 1; bedNumber <= icuBeds; bedNumber++) {
        bedBlueprints.push({
          bedId: `${wardId}-icu-${bedNumber}`,
          bedNumber,
          type: "ICU",
        });
      }

      const maintenanceStart = occupiedBeds;
      const maintenanceEnd = occupiedBeds + wardConfig.maintenanceBeds;

      for (let index = 0; index < bedBlueprints.length; index++) {
        const blueprint = bedBlueprints[index];
        const admittedPatient = admitted[index] || null;

        if (admittedPatient) {
          beds.push({
            bedId: blueprint.bedId,
            wardId,
            bedNumber: blueprint.bedNumber,
            type: blueprint.type,
            status: "occupied",
            patientId: admittedPatient.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          continue;
        }

        const isMaintenance =
          index >= maintenanceStart && index < maintenanceEnd;
        beds.push({
          bedId: blueprint.bedId,
          wardId,
          bedNumber: blueprint.bedNumber,
          type: blueprint.type,
          status: isMaintenance ? "maintenance" : "available",
          patientId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await db.collection("wards").insertOne({
        wardId,
        name: wardName,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (admitted.length + queued.length > 0) {
        await db.collection("patients").insertMany([...admitted, ...queued]);
      }

      await db.collection("beds").insertMany(beds);

      totalPatients += admitted.length + queued.length;
      totalBeds += beds.length;

      console.log(
        `✅ Seeded ${wardName}: ${admitted.length} admitted, ${queued.length} queued, ${beds.length} beds`
      );
    }

    console.log(
      `\n🎉 Database reset complete! Total Patients: ${totalPatients}, Total Beds: ${totalBeds}`
    );
  } finally {
    await client.close();
  }
}

resetDatabase().catch((error) => {
  console.error("❌ DB reset failed:", error.message);
  process.exit(1);
});
