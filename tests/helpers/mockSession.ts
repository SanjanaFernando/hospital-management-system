import { vi } from 'vitest';
import type { UserSession, StaffRole } from '@/app/types';
import type { Db, Collection } from 'mongodb';

/**
 * Factory function to create a mock UserSession object
 */
export function makeSession(overrides?: Partial<UserSession>): UserSession {
  return {
    role: 'admin',
    displayName: 'Test Admin',
    userId: 'test-100001',
    wardIds: ['ward-0'],
    wardId: 'ward-0',
    ...overrides,
  };
}

/**
 * Create a mock MongoDB collection with vi.fn() mocks for common methods
 */
export function makeMockCollection(collectionName: string): Collection {
  return {
    findOne: vi.fn(),
    find: vi.fn().mockReturnValue({
      projection: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    }),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
  } as any;
}

/**
 * Create a mock MongoDB database object
 */
export function makeMockDb(): Partial<Db> {
  const collections: Record<string, any> = {};

  return {
    collection: vi.fn((name: string) => {
      if (!collections[name]) {
        collections[name] = makeMockCollection(name);
      }
      return collections[name];
    }),
    admin: vi.fn(() => ({
      ping: vi.fn().mockResolvedValue({}),
    })),
    listCollections: vi.fn().mockResolvedValue([]),
  } as any;
}

/**
 * Create a mock NextRequest headers object
 */
export function makeMockHeaders(sessionData?: Partial<UserSession>): Headers {
  const headers = new Map<string, string>();
  const session = makeSession(sessionData);

  headers.set('x-user-role', session.role);
  if (session.userId) headers.set('x-user-id', session.userId);
  if (session.displayName) headers.set('x-user-name', session.displayName);
  if (session.wardId) headers.set('x-user-ward-id', session.wardId);
  if (session.wardIds && session.wardIds.length > 0) {
    headers.set('x-user-ward-ids', session.wardIds.join(','));
  }

  // Create a proper Headers object (duck-typed)
  return {
    get: (key: string) => headers.get(key.toLowerCase()) || null,
    has: (key: string) => headers.has(key.toLowerCase()),
  } as any;
}

/**
 * Create mock headers with no role (simulates missing auth header)
 */
export function makeMockHeadersNoRole(): Headers {
  return {
    get: () => null,
    has: () => false,
  } as any;
}
