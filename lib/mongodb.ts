import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error(
    'Invalid/Missing environment variable: "MONGODB_URI". Please check your .env.local file.'
  );
}

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

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  if (mongoConnection.client && mongoConnection.db) {
    return {
      client: mongoConnection.client,
      db: mongoConnection.db,
    };
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (!mongoConnection.promise) {
        console.log(
          `🔄 MongoDB connection attempt ${attempt}/${MAX_RETRIES}...`
        );
        const client = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 15000, // 15 seconds
          socketTimeoutMS: 15000, // 15 seconds
          connectTimeoutMS: 15000, // 15 seconds
          retryWrites: true,
          maxPoolSize: 10,
          minPoolSize: 2,
        });

        mongoConnection.promise = client.connect();
      }

      const client = await mongoConnection.promise;

      const db = client.db("hospital-management");

      // Verify connection with a ping
      await db.admin().ping();

      mongoConnection.client = client;
      mongoConnection.db = db;

      console.log("✅ Connected to MongoDB Successfully");
      return { client, db };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      mongoConnection.promise = null;
      console.error(
        `❌ MongoDB connection error (attempt ${attempt}/${MAX_RETRIES}):`,
        lastError.message
      );

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(
          `⏳ Retrying in ${delayMs}ms... (Waiting for network/DNS recovery)`
        );
        await delay(delayMs);
      }
    }
  }

  const finalError = new Error(
    `Failed to connect to MongoDB after ${MAX_RETRIES} attempts: ${lastError?.message}. 

Troubleshooting:
1. Check your internet connection
2. Verify MongoDB Atlas cluster is running (check cluster0 on mongodb.com)
3. Ensure IP Whitelist includes your current IP address
4. Try connecting from a different network (mobile hotspot)
5. MongoDB Atlas may be temporarily unavailable - try again in a few minutes`
  );
  console.error(finalError.message);
  throw finalError;
}

export async function closeDatabase() {
  if (mongoConnection.client) {
    await mongoConnection.client.close();
    mongoConnection.client = null;
    mongoConnection.db = null;
  }
}
