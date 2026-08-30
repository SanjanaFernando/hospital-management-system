import { MongoClient } from "mongodb";
import path from "path";
import fs from "fs";

function loadMongoUri() {
  if (process.env.MONGODB_URI) {
    console.log("✅ Loaded MONGODB_URI from environment");
    return process.env.MONGODB_URI;
  }
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("MONGODB_URI=")) {
        const val = trimmed.substring("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
        console.log("✅ Loaded MONGODB_URI from .env.local");
        console.log(`Connection string prefix: ${val.substring(0, Math.min(30, val.length))}...`);
        return val;
      }
    }
  }
  console.error("❌ MONGODB_URI is not defined. Please set it in .env.local or environment variables.");
  process.exit(1);
}

const MALE_FIRST_NAMES = [
  "Buddhika", "Chathura", "Dilan", "Farzan", "Gayan", "Isuru", "Kasun",
  "Lahiru", "Nimal", "Oshada", "Pradeep", "Ruwan", "Sanjaya", "Tharindu",
  "Vishwa", "Yohan", "Zubair", "Amara", "Janaka", "Chaminda",
];

const FEMALE_FIRST_NAMES = [
  "Erandi", "Hiruni", "Janaki", "Manjula", "Upeksha", "Wasana", "Sandya",
  "Dilrukshi", "Chamari", "Nimasha", "Sachini", "Thilini", "Malsha",
  "Kavindi", "Nadeesha", "Piumika", "Roshani", "Sewwandi", "Buddhima", "Hasini",
];

const LAST_NAMES = [
  "Perera", "Fernando", "De Silva", "Jayasinghe", "Wijesinghe",
  "Liyanage", "Rathnayake", "Gamage", "Herath", "Abeykoon",
  "Bandara", "Dissanayake", "Senanayake", "Wickramasinghe",
  "Karunaratne", "Gunawardena",
];

const DISEASES = [
  "Acute Appendicitis", "Inguinal Hernia", "Gallbladder Disease",
  "Surgical Wound Infection", "Bowel Obstruction", "Post-Op Monitoring",
  "Fracture Fixation", "Abdominal Trauma", "Chest Pain", "Vertigo",
  "Fits", "Rash on Buttocks", "Pneumonia", "Urinary Tract Infection",
  "Hypertensive Crisis", "Dengue Fever", "Acute Gastroenteritis",
];

const SPECIAL_REQUIREMENTS = [
  "Oxygen Required",
  "Isolation Required",
  "Fall Risk",
  "Wheelchair Access Needed",
  "Cardiac Monitoring",
];

const TRIAGE_LEVELS = [
  "Triage 1",
  "Triage 2",
  "Triage 3",
  "Triage 4",
  "Triage 5",
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePriority() {
  const rand = Math.random();
  if (rand < 0.10) return TRIAGE_LEVELS[0]; // 10% critical
  if (rand < 0.30) return TRIAGE_LEVELS[1]; // 20% emergent
  if (rand < 0.60) return TRIAGE_LEVELS[2]; // 30% urgent
  if (rand < 0.80) return TRIAGE_LEVELS[3]; // 20% semi-urgent
  return TRIAGE_LEVELS[4];                   // 20% non-urgent
}

function ageGroupFromAge(age) {
  if (age < 13) return "Child";
  if (age < 60) return "Adult";
  return "Elderly";
}

let patientCounter = 10001;

// gender must be "Male" or "Female"
function generatePatient(patientId, wardId, status, gender) {
  const firstName = gender === "Male"
    ? randomItem(MALE_FIRST_NAMES)
    : randomItem(FEMALE_FIRST_NAMES);
  const lastName = randomItem(LAST_NAMES);
  const age = randomInt(5, 90);
  const admissionTime = new Date(Date.now() - randomInt(5, 72) * 60 * 60 * 1000);

  const includeRequirements = Math.random() < 0.35;
  const requirements = includeRequirements ? [randomItem(SPECIAL_REQUIREMENTS)] : undefined;

  const hasPrevDiseases = Math.random() < 0.6;
  const previousDiseases = hasPrevDiseases ? [randomItem(DISEASES)] : [];

  const numericId = String(patientCounter++);

  return {
    id: numericId,
    wardId,
    status,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup: ageGroupFromAge(age),
    gender,
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

// ---------------------------------------------------------------------------
// Ward configurations
// Free beds graduate from tightest (Ward 2, min 2) to most available (Ward 9, 10).
// ICU beds are 2-3 random per ward.
// ---------------------------------------------------------------------------
function makeWardConfigs() {
  return [
    {
      wardId:         "ward-2",
      name:           "Ward 2 - General",
      maleAdmitted:   35,
      femaleAdmitted: 35,
      queuePatients:  8,
      icuBeds:        randomInt(2, 3),
      freeBeds:       randomInt(2, 4),   // starts from 2 — tightest ward
    },
    {
      wardId:         "ward-3",
      name:           "Ward 3 - Female Medical",
      maleAdmitted:   0,
      femaleAdmitted: 42,
      queuePatients:  10,
      icuBeds:        randomInt(2, 3),
      freeBeds:       randomInt(3, 5),   // slightly more slack
    },
    {
      wardId:         "ward-5",
      name:           "Ward 5 - Male Surgical",
      maleAdmitted:   55,
      femaleAdmitted: 0,
      queuePatients:  12,
      icuBeds:        randomInt(2, 3),
      freeBeds:       randomInt(5, 7),   // more relaxed
    },
    {
      wardId:         "ward-9",
      name:           "Ward 9 - General Medical",
      maleAdmitted:   23,
      femaleAdmitted: 23,
      queuePatients:  9,
      icuBeds:        randomInt(2, 3),
      freeBeds:       10,                // most available — fixed at 10
    },
  ];
}

/**
 * Determine the gender designation for a normal bed based on its 0-based index
 * and the pre-calculated section sizes for the ward.
 *
 * Rules:
 *  - Pure female ward  → all normal beds are "Female"
 *  - Pure male ward    → all normal beds are "Male"
 *  - Mixed ward        → first `maleSectionSize` beds are "Male",
 *                        remaining beds are "Female".
 *                        Free beds are split proportionally: ceil(freeBeds/2)
 *                        go to the Male section, the rest to the Female section.
 * ICU beds are always "Unisex" (critical care accepts any patient).
 */
function bedGenderForNormal(bedIndex, maleSectionSize, femaleAdmitted) {
  if (femaleAdmitted === 0) return "Male";   // pure male ward
  if (maleSectionSize === 0) return "Female"; // pure female ward
  return bedIndex < maleSectionSize ? "Male" : "Female";
}

async function resetDatabase() {
  const mongoUri = loadMongoUri();

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS:          30000,
    connectTimeoutMS:         30000,
    retryWrites:              false,
  });

  try {
    await client.connect();
    const db = client.db("hospital-management");

    console.log("🗑️  Clearing existing data...");
    await Promise.all([
      db.collection("wards").deleteMany({}),
      db.collection("beds").deleteMany({}),
      db.collection("patients").deleteMany({}),
    ]);

    const wardConfigs = makeWardConfigs();
    let totalPatients = 0;
    let totalBeds = 0;

    for (const cfg of wardConfigs) {
      const { wardId, name, maleAdmitted, femaleAdmitted, queuePatients, icuBeds, freeBeds } = cfg;
      const totalAdmitted = maleAdmitted + femaleAdmitted;

      // Normal beds = total admitted + free slots (all remaining beds beyond admitted patients)
      const normalBeds = totalAdmitted + freeBeds;
      const bedCount   = normalBeds + icuBeds;

      // ---------------------------------------------------------------
      // Admitted patients — exact gender split
      // ---------------------------------------------------------------
      const admitted = [];
      for (let i = 0; i < maleAdmitted; i++) {
        admitted.push(generatePatient(`${wardId}-m-${i + 1}`, wardId, "admitted", "Male"));
      }
      for (let i = 0; i < femaleAdmitted; i++) {
        admitted.push(generatePatient(`${wardId}-f-${i + 1}`, wardId, "admitted", "Female"));
      }

      // ---------------------------------------------------------------
      // Queued patients — gender matches ward style
      // ---------------------------------------------------------------
      const queued = [];
      for (let i = 0; i < queuePatients; i++) {
        let qGender;
        if (maleAdmitted > 0 && femaleAdmitted === 0)      qGender = "Male";
        else if (femaleAdmitted > 0 && maleAdmitted === 0) qGender = "Female";
        else                                                qGender = Math.random() < 0.5 ? "Male" : "Female";
        queued.push(generatePatient(`${wardId}-q-${i + 1}`, wardId, "queued", qGender));
      }

      // ---------------------------------------------------------------
      // Beds — normal beds first, then ICU beds
      // ---------------------------------------------------------------
      const beds = [];

      // For mixed wards: distribute free beds proportionally between sections.
      // maleSectionSize = maleAdmitted beds + ceil(freeBeds/2) extra beds.
      // femaleSectionSize = the remainder.
      // Pure wards: all normal beds belong to that gender.
      const maleSectionSize = maleAdmitted > 0 && femaleAdmitted > 0
        ? maleAdmitted + Math.ceil(freeBeds / 2)
        : maleAdmitted > 0
          ? normalBeds  // pure male — all beds are Male
          : 0;          // pure female — maleSectionSize = 0, all beds are Female

      for (let n = 1; n <= normalBeds; n++) {
        const bedIdx     = n - 1;  // 0-based
        const admittedPt = admitted[bedIdx] || null;
        const gender     = bedGenderForNormal(bedIdx, maleSectionSize, femaleAdmitted);
        beds.push({
          bedId:     `${wardId}-normal-${n}`,
          wardId,
          bedNumber: n,
          type:      "NORMAL",
          gender,
          status:    admittedPt ? "occupied" : "available",
          patientId: admittedPt ? admittedPt.id : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // ICU beds: randomly occupy exactly 1 to make it realistic
      // ICU beds are always Unisex — critical care overrides gender separation.
      const icuOccupiedIndex = randomInt(0, icuBeds - 1);
      for (let n = 1; n <= icuBeds; n++) {
        const isOccupied = (n - 1) === icuOccupiedIndex;
        beds.push({
          bedId:     `${wardId}-icu-${n}`,
          wardId,
          bedNumber: normalBeds + n,
          type:      "ICU",
          gender:    "Unisex",
          status:    isOccupied ? "occupied" : "available",
          patientId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // ---------------------------------------------------------------
      // Insert
      // ---------------------------------------------------------------
      await db.collection("wards").insertOne({
        wardId,
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (admitted.length + queued.length > 0) {
        await db.collection("patients").insertMany([...admitted, ...queued]);
      }

      await db.collection("beds").insertMany(beds);

      totalPatients += admitted.length + queued.length;
      totalBeds     += beds.length;

      const freeCount = beds.filter(b => b.status === "available").length;
      console.log(
        `✅ Seeded ${name}:\n` +
        `   Admitted → Male: ${maleAdmitted}, Female: ${femaleAdmitted}` +
        `  |  Queued: ${queuePatients}` +
        `  |  Beds: ${bedCount} total (${freeCount} free, ${icuBeds} ICU)`
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
