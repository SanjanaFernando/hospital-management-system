import { randomBytes, pbkdf2Sync, timingSafeEqual, createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Password hashing — PBKDF2 with SHA-256 (built-in Node.js, no extra deps)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_DIGEST = "sha256";

export function generateSalt(): string {
  return randomBytes(32).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST
  ).toString("hex");
}

export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string
): boolean {
  const hash = hashPassword(password, salt);
  const hashBuffer = Buffer.from(hash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (hashBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, storedBuffer);
}

// ---------------------------------------------------------------------------
// JWT — HMAC-SHA256 signed tokens (no external library)
// ---------------------------------------------------------------------------

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'Missing environment variable: "JWT_SECRET". Please check your .env.local file.'
    );
  }
  return secret;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  let padded = data.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

interface JwtPayload {
  userId: string;
  role: string;
  wardId?: string;
  wardIds?: string[];
  displayName?: string;
  iat: number;
  exp: number;
}

const JWT_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

export function createSessionToken(payload: {
  userId: string;
  role: string;
  wardId?: string;
  wardIds?: string[];
  displayName?: string;
}): string {
  const secret = getJwtSecret();

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );

  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + JWT_EXPIRY_SECONDS,
    })
  );

  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${header}.${body}.${signature}`;
}

export function verifySessionToken(token: string): JwtPayload | null {
  try {
    const secret = getJwtSecret();
    const [header, body, signature] = token.split(".");

    if (!header || !body || !signature) {
      return null;
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(body)) as JwtPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// User ID generation — sequential 6-digit IDs starting from 100001
// (100000 is reserved for the seeded admin)
// ---------------------------------------------------------------------------

export async function generateUserId(
  db: import("mongodb").Db
): Promise<string> {
  const lastUser = await db
    .collection("users")
    .find({})
    .sort({ userId: -1 })
    .limit(1)
    .toArray();

  if (lastUser.length === 0) {
    return "100001";
  }

  const lastId = parseInt(lastUser[0].userId, 10);
  const nextId = lastId + 1;

  if (nextId > 999999) {
    throw new Error("User ID overflow — maximum 6-digit IDs reached.");
  }

  return String(nextId);
}
