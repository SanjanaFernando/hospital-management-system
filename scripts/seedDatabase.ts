/**
 * Database initialization script
 * Run this once to populate MongoDB with initial data
 * Usage: npx ts-node scripts/seedDatabase.ts
 */

import { MongoClient } from "mongodb";
import { initializeWards } from "../app/utils/mockData";

async function seedDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI as string;

  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI environment variable");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    console.log("Connecting to MongoDB...");
    await client.connect();
    const db = client.db("hospital-management");

    // Clear existing data
    console.log("Clearing existing collections...");
    await db.collection("wards").deleteMany({});
    await db.collection("patients").deleteMany({});
    await db.collection("beds").deleteMany({});

    // Initialize mock wards
    const wards = initializeWards();

    // Prepare data for MongoDB
    for (const ward of wards) {
      // Insert ward
      await db.collection("wards").insertOne({
        name: ward.name,
        wardId: ward.id,
        totalBeds: ward.totalBeds,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`Inserted ward: ${ward.name}`);

      // Insert patients (admitted)
      for (const patient of ward.patients) {
        await db.collection("patients").insertOne({
          ...patient,
          wardId: ward.id,
          status: "admitted",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      console.log(
        `Inserted ${ward.patients.length} admitted patients for ${ward.name}`,
      );

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

      console.log(
        `Inserted ${ward.patientQueue.length} queued patients for ${ward.name}`,
      );

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

      console.log(`Inserted ${ward.beds.length} beds for ${ward.name}`);
    }

    console.log("Database seeded successfully!");
    await client.close();
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    await client.close();
    process.exit(1);
  }
}

seedDatabase();
