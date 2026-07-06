/**
 * Seed script to create the initial admin account.
 *
 * Usage:  npm run db:seed-admin
 *         node scripts/seedAdmin.mjs
 *
 * Admin credentials:
 *   User ID:  100000
 *   Password: admin123 (must change on first login)
 */

import { MongoClient } from "mongodb";
import { pbkdf2Sync, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Config — mirrors .env.local values
// ---------------------------------------------------------------------------
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://hospitaladmin:Sanjana1234@hospital-db.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000";
const MONGODB_DB = process.env.MONGODB_DB || "hospital-management";

const ADMIN_USER_ID = "100000";
const ADMIN_PASSWORD = "admin123";
const ADMIN_EMAIL = "admin@hospital.local";

// ---------------------------------------------------------------------------
// Password hashing (same algorithm as lib/auth.ts)
// ---------------------------------------------------------------------------
function generateSalt() {
  return randomBytes(32).toString("hex");
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100_000, 64, "sha256").toString("hex");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🔄 Connecting to database...");

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    retryWrites: false,
    tls: true,
  });

  try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    console.log("✅ Connected to", MONGODB_DB);

    // Check if admin already exists
    const existing = await db
      .collection("users")
      .findOne({ userId: ADMIN_USER_ID });

    if (existing) {
      console.log(`🔄 Admin user (${ADMIN_USER_ID}) already exists. Resetting password to default (admin123)...`);
      const salt = generateSalt();
      const passwordHash = hashPassword(ADMIN_PASSWORD, salt);

      await db.collection("users").updateOne(
        { userId: ADMIN_USER_ID },
        {
          $set: {
            passwordHash,
            salt,
            mustChangePassword: true,
            updatedAt: new Date(),
          }
        }
      );
      console.log("");
      console.log("✅ Admin password reset successfully!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`   User ID:  ${ADMIN_USER_ID}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("⚠️  You will be prompted to change your password on first login.");
      console.log("");
      return;
    }

    // Create admin
    const salt = generateSalt();
    const passwordHash = hashPassword(ADMIN_PASSWORD, salt);

    await db.collection("users").insertOne({
      userId: ADMIN_USER_ID,
      email: ADMIN_EMAIL,
      passwordHash,
      salt,
      role: "admin",
      displayName: "System Admin",
      mustChangePassword: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create unique index on userId
    try {
      await db.collection("users").createIndex({ userId: 1 }, { unique: true });
      console.log("📇 Created unique index on users.userId");
    } catch {
      console.log("📇 Index on users.userId already exists");
    }

    // Create index on email
    try {
      await db.collection("users").createIndex({ email: 1 }, { unique: true });
      console.log("📇 Created unique index on users.email");
    } catch {
      console.log("📇 Index on users.email already exists");
    }

    console.log("");
    console.log("✅ Admin user created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`   User ID:  ${ADMIN_USER_ID}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⚠️  You will be prompted to change your password on first login.");
    console.log("");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log("🔒 Database connection closed.");
  }
}

main();
