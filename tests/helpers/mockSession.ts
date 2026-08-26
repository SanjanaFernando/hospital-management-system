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
 * Create a mock NextRequest headers object.
 *
 * IMPORTANT: This must return a real Headers instance, not a duck-typed
 * object with just get()/has(). NextRequest's constructor normalizes
 * whatever is passed to its `headers` option internally, and a fake object
 * without a proper iterator/entries() is silently dropped — resulting in
 * an EMPTY real Headers object inside the request, not your fake one.
 * That was causing x-user-role to read as missing in every route test,
 * silently triggering the Finding #1 admin-fallback bug and making it look
 * like permission checks were being bypassed when they weren't.
 */
export function makeMockHeaders(sessionData?: Partial<UserSession>): Headers {
  const session = makeSession(sessionData);
  const headers = new Headers();

  headers.set('x-user-role', session.role);
  if (session.userId) headers.set('x-user-id', session.userId);
  if (session.displayName) headers.set('x-user-name', session.displayName);
  if (session.wardId) headers.set('x-user-ward-id', session.wardId);
  if (session.wardIds && session.wardIds.length > 0) {
    headers.set('x-user-ward-ids', session.wardIds.join(','));
  }

  return headers;
}

/**
 * Create mock headers with no role (simulates missing auth header)
 */
export function makeMockHeadersNoRole(): Headers {
  return new Headers();
}