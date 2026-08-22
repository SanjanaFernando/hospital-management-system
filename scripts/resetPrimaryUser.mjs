import { MongoClient } from "mongodb";
import { pbkdf2Sync, randomBytes } from "crypto";
import path from "path";
import fs from "fs";

function loadMongoUri() {
  if (process.env.MONGODB_URI) {
    console.log("Loaded MONGODB_URI from environment");
    return process.env.MONGODB_URI;
  }
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("MONGODB_URI=")) {
        const val = trimmed.substring("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
        console.log("Loaded MONGODB_URI from .env.local");
        console.log("Connection string prefix: " + val.substring(0, Math.min(30, val.length)) + "...");
        return val;
      }
    }
  }
  console.error("MONGODB_URI not defined in .env.local or environment.");
  process.exit(1);
}

const ADMIN_PASSWORD = "Admin@123";
const MONGODB_DB = process.env.MONGODB_DB || "hospital-management";

// Both admin accounts seeded by this script
const ADMIN_USERS = [
  { userId: "10000",  displayName: "Primary Admin", email: "admin10000@hospital.local",  isPrimaryAdmin: true  },
  { userId: "100000", displayName: "System Admin",  email: "admin100000@hospital.local", isPrimaryAdmin: false },
];

function generateSalt() {
  return randomBytes(32).toString("hex");
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
}

async function upsertAdmin(db, user) {
  const salt = generateSalt();
  const passwordHash = hashPassword(ADMIN_PASSWORD, salt);
  const existing = await db.collection("users").findOne({ userId: user.userId });

  if (existing) {
    // Only reset auth fields — do NOT touch email to avoid duplicate key errors
    await db.collection("users").updateOne(
      { userId: user.userId },
      { $set: { passwordHash, salt, mustChangePassword: false, isActive: true, updatedAt: new Date() } }
    );
    console.log("  [RESET]   userId=" + user.userId);
  } else {
    await db.collection("users").insertOne({
      userId: user.userId,
      email: user.email,
      passwordHash,
      salt,
      role: "admin",
      displayName: user.displayName,
      mustChangePassword: false,
      isActive: true,
      isPrimaryAdmin: user.isPrimaryAdmin,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log("  [CREATED] userId=" + user.userId);
  }
}

async function main() {
  const mongoUri = loadMongoUri();
  console.log("Connecting to database...");

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    retryWrites: false,
  });

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    console.log("Connected to " + MONGODB_DB + "\n");

    for (const user of ADMIN_USERS) {
      await upsertAdmin(db, user);
    }

    // Ensure indexes (ignore if already exist)
    try { await db.collection("users").createIndex({ userId: 1 }, { unique: true }); } catch { }
    try { await db.collection("users").createIndex({ email: 1 }, { unique: true }); } catch { }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  User ID   │  Password");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    for (const user of ADMIN_USERS) {
      console.log("  " + user.userId + "  │  " + ADMIN_PASSWORD);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } catch (error) {
    console.error("Error: " + error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("Database connection closed.");
  }
}

main();