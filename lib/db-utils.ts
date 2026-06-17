// lib/db-utils.ts
import { connectToDatabase } from "./mongodb";

export async function clearAllCollections() {
  const { db } = await connectToDatabase();

  console.log("🗑️ Clearing all collections in Cosmos DB...");

  const result = await Promise.all([
    db.collection("wards").deleteMany({}),
    db.collection("patients").deleteMany({}),
    db.collection("beds").deleteMany({}),
  ]);

  console.log("✅ All collections cleared successfully!");
  console.log(
    `Deleted: ${result[0].deletedCount} wards, ${result[1].deletedCount} patients, ${result[2].deletedCount} beds`
  );

  return true;
}

export async function listCollections() {
  const { db } = await connectToDatabase();
  const collections = await db.listCollections().toArray();
  console.log(
    "📋 Available collections:",
    collections.map((c) => c.name)
  );
}
