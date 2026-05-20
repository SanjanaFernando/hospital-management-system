import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "hospital-management";

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const client = new MongoClient(uri, {
  maxPoolSize: 5,
  minPoolSize: 0,
});

async function main() {
  await client.connect();
  const db = client.db(dbName);

  await Promise.all([
    db.collection("wards").createIndex({ wardId: 1 }, { unique: true }),
    db.collection("wards").createIndex({ updatedAt: -1 }),
    db
      .collection("patients")
      .createIndex(
        { wardId: 1, status: 1, createdAt: -1 },
        { name: "patients_ward_status_createdAt" }
      ),
    db
      .collection("patients")
      .createIndex(
        { wardId: 1, admissionTime: -1 },
        { name: "patients_ward_admissionTime" }
      ),
    db
      .collection("patients")
      .createIndex(
        { name: "text", disease: "text" },
        { name: "patients_text_search" }
      ),
    db
      .collection("beds")
      .createIndex(
        { wardId: 1, status: 1, bedNumber: 1 },
        { name: "beds_ward_status_bedNumber" }
      ),
    db
      .collection("beds")
      .createIndex(
        { wardId: 1, type: 1, bedNumber: 1 },
        { name: "beds_ward_type_bedNumber" }
      ),
    db
      .collection("staff_members")
      .createIndex(
        { wardId: 1, role: 1, createdAt: -1 },
        { name: "staff_ward_role_createdAt" }
      ),
  ]);

  console.log("MongoDB indexes created successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to create indexes:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
