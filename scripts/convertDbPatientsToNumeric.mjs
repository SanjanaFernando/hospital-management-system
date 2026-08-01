import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

function loadMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI.trim();
  }

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
      uri = uri.replace(/^["']|["']$/g, "");
      return uri;
    }
  }

  throw new Error("MONGODB_URI not found in .env.local");
}

async function convertPatientsToNumeric() {
  const uri = loadMongoUri();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    retryWrites: false,
  });

  try {
    await client.connect();
    const db = client.db("hospital-management");

    console.log("🔄 Resetting and converting all patient IDs to numbers...");

    const patients = await db.collection("patients").find({}).toArray();
    console.log(`Found ${patients.length} patient records.`);

    let counter = 10001;
    const oldToNewIdMap = new Map();

    for (const patient of patients) {
      const oldId = patient.id || String(patient._id);
      let newNumericId;

      if (patient.id && /^\d+$/.test(String(patient.id))) {
        newNumericId = String(patient.id);
        const numVal = parseInt(newNumericId, 10);
        if (numVal >= counter) {
          counter = numVal + 1;
        }
      } else {
        newNumericId = String(counter++);
      }

      oldToNewIdMap.set(oldId, newNumericId);

      // Ensure previousDiseases is populated as an array
      const previousDiseases = Array.isArray(patient.previousDiseases)
        ? patient.previousDiseases
        : patient.previousDiseases
        ? [String(patient.previousDiseases)]
        : [];

      await db.collection("patients").updateOne(
        { _id: patient._id },
        {
          $set: {
            id: newNumericId,
            previousDiseases,
            updatedAt: new Date(),
          },
        }
      );

      console.log(`  Patient "${patient.name}": ${oldId} -> ${newNumericId}`);
    }

    // Now update bed references
    console.log("🔄 Updating bed patientId references...");
    const beds = await db.collection("beds").find({ patientId: { $ne: null } }).toArray();

    for (const bed of beds) {
      const oldPatientId = bed.patientId;
      if (oldToNewIdMap.has(oldPatientId)) {
        const newNumericId = oldToNewIdMap.get(oldPatientId);
        await db.collection("beds").updateOne(
          { _id: bed._id },
          { $set: { patientId: newNumericId, updatedAt: new Date() } }
        );
        console.log(`  Bed ${bed.bedId}: patientId ${oldPatientId} -> ${newNumericId}`);
      }
    }

    console.log("✅ Successfully reset all patient IDs to numbers in MongoDB!");
  } catch (error) {
    console.error("❌ Conversion failed:", error);
  } finally {
    await client.close();
  }
}

convertPatientsToNumeric();
