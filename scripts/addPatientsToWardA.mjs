/**
 * Script to add 20 queued patients to Ward A
 * Run this while the Next.js dev server is running
 * Usage: node scripts/addPatientsToWardA.mjs
 */

const API_BASE_URL = "http://localhost:3000/api";

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
  "Christopher",
  "Amanda",
  "Daniel",
  "Emily",
  "Matthew",
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

function generateMockPatient(index) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const age = Math.floor(Math.random() * 85) + 5;

  let ageGroup;
  if (age < 13) ageGroup = "Child";
  else if (age < 60) ageGroup = "Adult";
  else ageGroup = "Elderly";

  const priorityRand = Math.random();
  let priority;
  if (priorityRand < 0.1) priority = "Critical";
  else if (priorityRand < 0.3) priority = "Urgent";
  else priority = "Non-urgent";

  const hasSpecialRequirements = Math.random() < 0.4;
  const patientSpecialRequirements = hasSpecialRequirements
    ? [
        specialRequirements[
          Math.floor(Math.random() * specialRequirements.length)
        ],
      ]
    : undefined;

  return {
    id: `wardA-queue-${Date.now()}-${index}`,
    name: `${firstName} ${lastName}`,
    age,
    ageGroup,
    disease: diseases[Math.floor(Math.random() * diseases.length)],
    priority,
    admissionTime: new Date(),
    specialRequirements: patientSpecialRequirements,
    wardId: "ward-0", // Ward A
    status: "queued",
  };
}

async function createPatient(patient) {
  try {
    const response = await fetch(`${API_BASE_URL}/patients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error || "Failed to create patient";
      const details = data?.details || "";
      throw new Error(`${errorMessage}${details ? ": " + details : ""}`);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(message);
  }
}

async function addPatientsToWardA() {
  console.log("🏥 Adding 20 queued patients to Ward A...\n");
  console.log(
    "⚠️  Make sure the Next.js dev server is running on http://localhost:3000\n",
  );

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < 20; i++) {
    const patient = generateMockPatient(i);

    try {
      await createPatient(patient);
      successCount++;
      console.log(
        `✅ [${i + 1}/20] Registered: ${patient.name} (${patient.age}y, ${patient.priority})`,
      );

      // Small delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      failCount++;
      console.error(
        `❌ [${i + 1}/20] Failed: ${patient.name} - ${error.message}`,
      );
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   ✅ Successfully registered: ${successCount} patients`);
  console.log(`   ❌ Failed: ${failCount} patients`);
  console.log("\n✨ Done! Check Ward A's queue in the application.");
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(
      `${API_BASE_URL.replace("/api", "")}/api/health`,
    );
    if (response.ok) {
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

async function main() {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.error("❌ Error: Next.js development server is not running!");
    console.error("   Please start it with: npm run dev");
    console.error("   Then run this script again.");
    process.exit(1);
  }

  await addPatientsToWardA();
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});
