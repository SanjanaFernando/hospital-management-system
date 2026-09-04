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
  if (age < 18) return "Child";
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
  const isPediatric = wardId === "ward-2";
  const age = isPediatric ? randomInt(1, 15) : randomInt(18, 85);

  // Queued patients arrive before noon on 2026/9/4; admitted patients may have arrived earlier.
  const hour = status === "queued" ? randomInt(0, 11) : randomInt(0, 23);
  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);
  const admissionDay = status === "queued" ? 4 : randomInt(1, 3);
  const admissionTime = new Date(2026, 8, admissionDay, hour, minute, second);

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
    createdAt: admissionTime,
    updatedAt: admissionTime,
  };
}

// ---------------------------------------------------------------------------
// Ward configurations strictly following bed allocation specifications:
// - Ward 2: Pediatric (ICU 3, Male 33, Female 34)
// - Ward 3: Surgical Female (ICU 2, Female 40)
// - Ward 5: Surgical Male (ICU 2, Male 50)
// - Ward 9: Surgical General (ICU 2, Male 22, Female 22)
// ---------------------------------------------------------------------------
function makeWardConfigs() {
  return [
    {
      wardId:         "ward-2",
      name:           "Ward 2 - Pediatric",
      icuBeds:        3,
      maleBeds:       33,
      maleAdmitted:   30,  // last 3 beds (34-36) free
      femaleBeds:     34,
      femaleAdmitted: 30,  // last 4 beds (67-70) free
      queueCount:     8,
    },
    {
      wardId:         "ward-3",
      name:           "Ward 3 - Surgical Female",
      icuBeds:        2,
      maleBeds:       0,
      maleAdmitted:   0,
      femaleBeds:     40,
      femaleAdmitted: 36,  // last 4 beds (39-42) free
      queueCount:     8,
    },
    {
      wardId:         "ward-5",
      name:           "Ward 5 - Surgical Male",
      icuBeds:        2,
      maleBeds:       50,
      maleAdmitted:   46,  // last 4 beds (49-52) free
      femaleBeds:     0,
      femaleAdmitted: 0,
      queueCount:     10,
    },
    {
      wardId:         "ward-9",
      name:           "Ward 9 - Surgical General",
      icuBeds:        2,
      maleBeds:       22,
      maleAdmitted:   19,  // last 3 beds (22-24) free
      femaleBeds:     22,
      femaleAdmitted: 18,  // last 4 beds (43-46) free
      queueCount:     8,
    },
  ];
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
      const {
        wardId,
        name,
        icuBeds,
        maleBeds,
        maleAdmitted,
        femaleBeds,
        femaleAdmitted,
        queueCount,
      } = cfg;

      // ---------------------------------------------------------------
      // Admitted patients — strictly separated by gender
      // ---------------------------------------------------------------
      const malePatients = [];
      for (let i = 0; i < maleAdmitted; i++) {
        malePatients.push(generatePatient(`${wardId}-m-${i + 1}`, wardId, "admitted", "Male"));
      }

      const femalePatients = [];
      for (let i = 0; i < femaleAdmitted; i++) {
        femalePatients.push(generatePatient(`${wardId}-f-${i + 1}`, wardId, "admitted", "Female"));
      }

      // ---------------------------------------------------------------
      // Queued patients — matching ward gender policy
      // ---------------------------------------------------------------
      const queued = [];
      for (let i = 0; i < queueCount; i++) {
        let qGender;
        if (maleBeds > 0 && femaleBeds === 0)      qGender = "Male";
        else if (femaleBeds > 0 && maleBeds === 0) qGender = "Female";
        else                                       qGender = i % 2 === 0 ? "Male" : "Female";
        queued.push(generatePatient(`${wardId}-q-${i + 1}`, wardId, "queued", qGender));
      }

      // ---------------------------------------------------------------
      // Beds:
      // 1..icuBeds: ICU Beds (Unisex)
      // Next maleBeds: Male Beds (type NORMAL, gender Male)
      // Next femaleBeds: Female Beds (type NORMAL, gender Female)
      // ---------------------------------------------------------------
      const beds = [];
      let currentBedNumber = 1;

      // 1. ICU Beds (Unisex)
      for (let i = 1; i <= icuBeds; i++) {
        beds.push({
          bedId:     `${wardId}-icu-${currentBedNumber}`,
          wardId,
          bedNumber: currentBedNumber,
          type:      "ICU",
          gender:    "Unisex",
          status:    "available",
          patientId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        currentBedNumber++;
      }

      // 2. Male Beds (NORMAL, Male)
      for (let i = 0; i < maleBeds; i++) {
        const pt = malePatients[i] || null;
        beds.push({
          bedId:     `${wardId}-normal-${currentBedNumber}`,
          wardId,
          bedNumber: currentBedNumber,
          type:      "NORMAL",
          gender:    "Male",
          status:    pt ? "occupied" : "available",
          patientId: pt ? pt.id : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        currentBedNumber++;
      }

      // 3. Female Beds (NORMAL, Female)
      for (let i = 0; i < femaleBeds; i++) {
        const pt = femalePatients[i] || null;
        beds.push({
          bedId:     `${wardId}-normal-${currentBedNumber}`,
          wardId,
          bedNumber: currentBedNumber,
          type:      "NORMAL",
          gender:    "Female",
          status:    pt ? "occupied" : "available",
          patientId: pt ? pt.id : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        currentBedNumber++;
      }

      // ---------------------------------------------------------------
      // Insert to Database
      // ---------------------------------------------------------------
      await db.collection("wards").insertOne({
        wardId,
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const allPatients = [...malePatients, ...femalePatients, ...queued];
      if (allPatients.length > 0) {
        await db.collection("patients").insertMany(allPatients);
      }

      await db.collection("beds").insertMany(beds);

      totalPatients += allPatients.length;
      totalBeds     += beds.length;

      const freeCount = beds.filter(b => b.status === "available").length;
      console.log(
        `✅ Seeded ${name}:\n` +
        `   ICU Beds: 1-${icuBeds} (Unisex)\n` +
        `   Male Beds: ${maleBeds > 0 ? `${icuBeds + 1}-${icuBeds + maleBeds} (${maleAdmitted} occ, ${maleBeds - maleAdmitted} free)` : "None"}\n` +
        `   Female Beds: ${femaleBeds > 0 ? `${icuBeds + maleBeds + 1}-${beds.length} (${femaleAdmitted} occ, ${femaleBeds - femaleAdmitted} free)` : "None"}\n` +
        `   Total: ${beds.length} beds (${freeCount} free) | Patients: ${allPatients.length} (${queued.length} in queue)`
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
