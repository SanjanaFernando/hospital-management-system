import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

function loadMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const envRaw = fs.readFileSync(envPath, "utf-8");
  const line = envRaw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("MONGODB_URI="));

  if (!line) {
    return null;
  }

  return line.replace("MONGODB_URI=", "").trim();
}

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

function generatePatient(patientId, wardId, status) {
  const firstName = randomItem(FIRST_NAMES);
  const lastName = randomItem(LAST_NAMES);
  const age = randomInt(5, 90);
  const admissionTime = new Date(Date.now() - randomInt(5, 72) * 60 * 60 * 1000);

  const includeRequirements = Math.random() < 0.35;
  const requirements = includeRequirements
    ? [randomItem(SPECIAL_REQUIREMENTS)]
    : undefined;

  return {
    id: patientId,
    wardId,
    status,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup: ageGroupFromAge(age),
    gender: Math.random() < 0.5 ? "Male" : "Female",
    disease: randomItem(DISEASES),
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
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in environment or .env.local");
  }

  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db("hospital-management");

    console.log("Resetting collections: wards, beds, patients...");
    await Promise.all([
      db.collection("wards").deleteMany({}),
      db.collection("beds").deleteMany({}),
      db.collection("patients").deleteMany({}),
    ]);

    const wardNames = [
      "Ward A - General Medicine",
      "Ward B - Surgical",
      "Ward C - Cardiac",
      "Ward D - ICU",
    ];

    let totalPatients = 0;
    let totalBeds = 0;

    for (let wardIndex = 0; wardIndex < wardNames.length; wardIndex += 1) {
      const wardId = `ward-${wardIndex}`;
      const wardName = wardNames[wardIndex];
      const bedCount = 25;
      const occupiedBeds = randomInt(15, 18);
      const queuePatients = randomInt(4, 10);

      const admitted = [];
      const queued = [];
      const beds = [];

      for (let i = 0; i < occupiedBeds; i += 1) {
        const patientId = `${wardId}-admitted-${i + 1}`;
        admitted.push(generatePatient(patientId, wardId, "admitted"));
      }

      for (let i = 0; i < queuePatients; i += 1) {
        const patientId = `${wardId}-queue-${i + 1}`;
        queued.push(generatePatient(patientId, wardId, "queued"));
      }

      for (let bedNumber = 1; bedNumber <= bedCount; bedNumber += 1) {
        const admittedPatient = admitted[bedNumber - 1];
        if (admittedPatient) {
          beds.push({
            bedId: `${wardId}-bed-${bedNumber}`,
            wardId,
            bedNumber,
            status: "occupied",
            patientId: admittedPatient.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          continue;
        }

        const maintenance = Math.random() < 0.08;
        beds.push({
          bedId: `${wardId}-bed-${bedNumber}`,
          wardId,
          bedNumber,
          status: maintenance ? "maintenance" : "available",
          patientId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await db.collection("wards").insertOne({
        wardId,
        name: wardName,
        totalBeds: bedCount,
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
        `Seeded ${wardName}: ${admitted.length} admitted, ${queued.length} queued, ${beds.length} beds`,
      );
    }

    console.log(`Database reset complete. Patients: ${totalPatients}, Beds: ${totalBeds}`);
    console.log("All patients now use triage levels Triage 1 to Triage 5 only.");
  } finally {
    await client.close();
  }
}

resetDatabase().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("DB reset failed:", message);
  process.exit(1);
});
