// lib/mongodb.ts
import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "hospital-management";

interface MongoGlobalCache {
  client: MongoClient | null;
  db: Db | null;
  promise: Promise<MongoClient> | null;
}

declare global {
  var __mongoCache: MongoGlobalCache | undefined;
}

const mongoConnection: MongoGlobalCache = global.__mongoCache || {
  client: null,
  db: null,
  promise: null,
};

global.__mongoCache = mongoConnection;

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  if (!MONGODB_URI) {
    throw new Error(
      'Invalid/Missing environment variable: "MONGODB_URI". Please check your .env.local file.'
    );
  }

  if (mongoConnection.client && mongoConnection.db) {
    return { client: mongoConnection.client, db: mongoConnection.db };
  }

  if (!mongoConnection.promise) {
    console.log("🔄 Connecting to Azure Cosmos DB (MongoDB API)...");

    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000, // Increased
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      retryWrites: false,
      maxPoolSize: 10,
      minPoolSize: 1,
      tls: true, // Explicitly enable TLS
    });

    mongoConnection.promise = client.connect();
  }

  try {
    const client = await mongoConnection.promise;
    const db = client.db(MONGODB_DB);

    mongoConnection.client = client;
    mongoConnection.db = db;

    console.log("✅ Successfully connected to Azure Cosmos DB");
    return { client, db };
  } catch (error: any) {
    mongoConnection.promise = null;
    console.error("❌ Cosmos DB Connection Failed:", error.message);
    throw error;
  }
}

export async function closeDatabase() {
  if (mongoConnection.client) {
    await mongoConnection.client.close();
    mongoConnection.client = null;
    mongoConnection.db = null;
  }
}
