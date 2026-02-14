import { MongoClient, Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

interface MongoConnection {
  client: MongoClient | null;
  db: Db | null;
}

const mongoConnection: MongoConnection = {
  client: null,
  db: null,
};

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

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    const db = client.db("hospital_management");

    mongoConnection.client = client;
    mongoConnection.db = db;

    console.log("Connected to MongoDB Successfully");
    return { client, db };
  } catch (error) {
    console.error("MongoDB connection error:", error);
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
