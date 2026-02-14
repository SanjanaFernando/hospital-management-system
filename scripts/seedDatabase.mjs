/**
 * Database initialization script
 * Run this once to populate MongoDB with initial data
 * Usage: node scripts/seedDatabase.mjs
 */

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable");
}

// Mock data generation
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
];

function generateMockPatient(patientId) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const age = Math.floor(Math.random() * 85) + 5;

  let ageGroup;
  if (age < 13) ageGroup = "Child";
  else if (age < 65) ageGroup = "Adult";
  else ageGroup = "Elderly";

  const priorityRand = Math.random();
  let priority;
  if (priorityRand < 0.1) priority = "Critical";
  else if (priorityRand < 0.3) priority = "Urgent";
  else priority = "Non-urgent";

  const admissionTime = new Date(
    Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
  );
  const queueWaitTime = Math.floor(Math.random() * 480) + 15;

  const hasSpecialRequirements = Math.random() < 0.4;
  const patientSpecialRequirements = hasSpecialRequirements
    ? [
        specialRequirements[
          Math.floor(Math.random() * specialRequirements.length)
        ],
      ]
    : [];

  const isDischarged = Math.random() < 0.3;
  const dischargeTime = isDischarged
    ? new Date(
        admissionTime.getTime() + Math.random() * 25 * 24 * 60 * 60 * 1000,
      )
    : null;

  return {
    id: patientId,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup,
    disease: diseases[Math.floor(Math.random() * diseases.length)],
    priority,
    admissionTime,
    dischargeTime,
    queueWaitTime,
    specialRequirements: patientSpecialRequirements,
  };
}

function initializeWards() {
  const wardNames = [
    "Ward A - General Medicine",
    "Ward B - Surgical",
    "Ward C - Cardiac",
    "Ward D - ICU",
  ];

  return wardNames.map((name, wardIndex) => {
    const admittedPatients = [];
    const patientQueue = [];

    const occupiedCount = Math.floor(Math.random() * 3) + 15;
    for (let i = 0; i < occupiedCount; i++) {
      const patient = generateMockPatient(`ward${wardIndex}-patient-${i}`);
      admittedPatients.push(patient);
    }

    const queueCount = Math.floor(Math.random() * 5) + 2;
    for (let i = 0; i < queueCount; i++) {
      const patient = generateMockPatient(`ward${wardIndex}-queue-${i}`);
      patientQueue.push(patient);
    }

    const beds = Array.from({ length: 25 }, (_, bedIndex) => {
      const bedNumber = bedIndex + 1;
      const patient = admittedPatients[bedIndex];

      if (patient) {
        return {
          id: `${wardIndex}-${bedIndex}`,
          bedNumber,
          status: "occupied",
          patient,
        };
      }

      const isMaintenance = Math.random() < 0.08;
      return {
        id: `${wardIndex}-${bedIndex}`,
        bedNumber,
        status: isMaintenance ? "maintenance" : "available",
      };
    });

    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
    const maintenanceBeds = beds.filter(
      (b) => b.status === "maintenance",
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
}

async function seedDatabase() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log("🔗 Connecting to MongoDB...");
    await client.connect();
    const db = client.db("hospital-management");

    console.log("🗑️  Clearing existing collections...");
    await db.collection("wards").deleteMany({});
    await db.collection("patients").deleteMany({});
    await db.collection("beds").deleteMany({});

    const wards = initializeWards();

    console.log("📝 Seeding database with hospital data...\n");

    for (const ward of wards) {
      // Insert ward
      await db.collection("wards").insertOne({
        name: ward.name,
        wardId: ward.id,
        totalBeds: ward.totalBeds,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`✅ Inserted ward: ${ward.name}`);

      // Insert admitted patients
      for (const patient of ward.patients) {
        await db.collection("patients").insertOne({
          ...patient,
          wardId: ward.id,
          status: "admitted",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log(`   └─ ${ward.patients.length} admitted patients`);

      // Insert queue patients
      for (const patient of ward.patientQueue) {
        await db.collection("patients").insertOne({
          ...patient,
          wardId: ward.id,
          status: "queued",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log(`   └─ ${ward.patientQueue.length} queued patients`);

      // Insert beds
      for (const bed of ward.beds) {
        await db.collection("beds").insertOne({
          bedId: bed.id,
          wardId: ward.id,
          bedNumber: bed.bedNumber,
          status: bed.status,
          patientId: bed.patient?.id || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log(`   └─ ${ward.beds.length} beds\n`);
    }

    console.log("✨ Database seeded successfully!");
    console.log("📊 Summary:");
    console.log(`   • 4 wards created`);
    console.log(`   • 100 total beds (25 per ward)`);
    console.log(`   • Patients and queues populated with realistic data`);
    console.log(`   • Database: hospital-management`);

    await client.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    await client.close();
    process.exit(1);
  }
}

seedDatabase();
