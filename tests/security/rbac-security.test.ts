/**
 * RBAC Security Tests
 * 
 * These tests document confirmed security findings from the codebase audit.
 * Each test is written to assert SECURE/expected behavior, so tests that fail
 * document actual bugs in the current implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

// Mock next/cache before importing route handlers that use it
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn: any) => fn), // pass through — just call the wrapped function directly, skip actual caching
}));

// Mock MongoDB before importing route handlers that use it
vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn((name: string) => {
        if (name === 'wards') {
          return {
            findOne: vi.fn().mockResolvedValue({
              wardId: 'ward-0',
              name: 'Ward A',
              totalBeds: 10,
            }),
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
            }),
            updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
          };
        }
        if (name === 'beds') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([]),
            }),
          };
        }
        if (name === 'patients') {
          return {
            findOne: vi.fn().mockResolvedValue(null),
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
            find: vi.fn().mockReturnValue({
              projection: vi.fn().mockReturnThis(),
              project: vi.fn().mockReturnThis(),
              sort: vi.fn().mockReturnThis(),
              toArray: vi.fn().mockResolvedValue([]),
            }),
            updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
            deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
          };
        }
        // default fallback for any other collection
        return {
          findOne: vi.fn().mockResolvedValue(null),
          insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
          find: vi.fn().mockReturnValue({
            projection: vi.fn().mockReturnThis(),
            project: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue([]),
          }),
          updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
          deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
        };
      }),
      admin: vi.fn(() => ({
        ping: vi.fn().mockResolvedValue({}),
      })),
    },
    client: {},
  })),
}));

import { getSessionFromHeaders, normalizeSession, DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac';
import { makeMockHeaders, makeMockHeadersNoRole, makeSession } from '@/tests/helpers/mockSession';

// ============================================================================
// TEST 1: Session Initialization Bug — Admin Fallback on Missing Role
// ============================================================================
// FINDING: getSessionFromHeaders() and normalizeSession() currently default to
// role "admin" when no x-user-role header is present or input is null.
// EXPECTED: Should reject or return an error state, not escalate to admin.
// ============================================================================

describe('Finding #1: Session Initialization — Unsafe Admin Fallback', () => {
  it('getSessionFromHeaders() should NOT default to admin role when x-user-role header is missing', () => {
    const headersNoRole = makeMockHeadersNoRole();
    const session = getSessionFromHeaders(headersNoRole);

    // SECURE expectation: role should NOT be "admin" when no header present
    expect(session.role).not.toBe('admin');
    // Expected: should be "guest" or throw, but currently it's "admin"
    // This test documents the bug.
  });

  it('normalizeSession() should NOT default to admin role when input is null/undefined', () => {
    const sessionFromNull = normalizeSession(null);
    const sessionFromUndefined = normalizeSession(undefined);

    // SECURE expectation: should not become admin on null input
    expect(sessionFromNull.role).not.toBe('admin');
    expect(sessionFromUndefined.role).not.toBe('admin');
  });

  it('normalizeSession() should preserve provided role without escalation', () => {
    const mainAttendant = makeSession({ role: 'main_attendant' });
    const normalized = normalizeSession(mainAttendant);

    // This should work correctly — provided role should NOT be changed to admin
    expect(normalized.role).toBe('main_attendant');
  });
});

// ============================================================================
// TEST 2: /api/explain — Missing Permission Enforcement
// ============================================================================
// FINDING: GET and POST /api/explain never call getSessionFromHeaders() or
// any permission check before running inference.
//
// APPROACH: Rather than executing the full route (which spawns a real Python
// subprocess and loads the MAPPO model — slow, fragile, and unrelated to the
// actual security question), this test statically inspects the route source
// to confirm no auth/permission check exists. This is a legitimate technique
// for confirming the absence of a code pattern without needing the full
// dependency chain to execute successfully.
// ============================================================================

describe('Finding #2: /api/explain Endpoint — Missing Auth & Permission Checks', () => {
  const routeSource = readFileSync(
    path.join(process.cwd(), 'app/api/explain/route.ts'),
    'utf-8'
  );

  it('GET/POST handlers should call getSessionFromHeaders() to authenticate the request', () => {
    // SECURE expectation: the route should authenticate before running inference
    expect(routeSource).toContain('getSessionFromHeaders');
  });

  it('GET/POST handlers should check reorder_queue permission before proceeding', () => {
    // SECURE expectation: the route should check permission before running inference
    const checksPermission =
      routeSource.includes('reorder_queue') ||
      routeSource.includes('canReorderQueue');
    expect(checksPermission).toBe(true);
  });
});

// ============================================================================
// TEST 3: main_attendant Permission Boundaries
// ============================================================================
// FINDING: main_attendant role should NOT have reorder_queue or view_reports
// permissions per DEFAULT_ROLE_PERMISSIONS. send_broadcast is currently true
// for this role — flagged for policy review, not necessarily a bug.
//
// FIX APPLIED: These tests now import the REAL DEFAULT_ROLE_PERMISSIONS from
// lib/rbac.ts instead of testing a hardcoded copy. A hardcoded object always
// passes regardless of what the actual source file says — it tests itself,
// not your code. Reading directly from the import means these tests will
// correctly fail if someone changes the real permission matrix.
// ============================================================================

describe('Finding #3: main_attendant Role Permission Boundaries', () => {
  it('main_attendant should NOT have reorder_queue permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.main_attendant.reorder_queue).toBe(false);
  });

  it('main_attendant should NOT have view_reports permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.main_attendant.view_reports).toBe(false);
  });

  it('FLAG: main_attendant currently HAS send_broadcast permission — review whether intended', () => {
    // This asserts CURRENT behavior (not necessarily correct behavior).
    // If a future fix restricts this, this test will fail loudly and force
    // someone to consciously update it, rather than the change going unnoticed.
    expect(DEFAULT_ROLE_PERMISSIONS.main_attendant.send_broadcast).toBe(true);
  });
});

// ============================================================================
// TEST 4: NoSQL Injection Resistance — POST /api/patients
// ============================================================================
// FINDING: POST /api/patients accepts user input (name) and uses it in a
// MongoDB regex query. Must reject non-string names and validate type strictly.
// EXPECTED: POST with name as object (e.g. {"$ne": null}) should return 400,
// not 201, and no injection document should be inserted.
// ============================================================================

describe('Finding #4: NoSQL Injection Prevention — Patient Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/patients should reject name field if it is an object (injection attempt)', async () => {
    const { POST } = await import('@/app/api/patients/route');

    const headers = makeMockHeaders({ role: 'consultant_doctor', wardIds: ['ward-0'] });
    const request = new NextRequest(new URL('http://localhost:3000/api/patients'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: { '$ne': null }, // NoSQL injection attempt
        age: 45,
        disease: 'Test Disease',
        wardId: 'ward-0',
      }),
    });

    const response = await POST(request);

    // SECURE expectation: non-string name should return 400, not 201
    expect(response.status).toBe(400);
    // Should NOT insert a document
    const { db } = await import('@/lib/mongodb').then(m => m.connectToDatabase());
    expect(db.collection('patients').insertOne).not.toHaveBeenCalled();
  });

  it('POST /api/patients should reject age field if it is negative', async () => {
    const { POST } = await import('@/app/api/patients/route');

    const headers = makeMockHeaders({ role: 'consultant_doctor', wardIds: ['ward-0'] });
    const request = new NextRequest(new URL('http://localhost:3000/api/patients'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Valid Patient Name',
        age: -45, // Invalid: negative age
        disease: 'Test Disease',
        wardId: 'ward-0',
      }),
    });

    const response = await POST(request);

    // SECURE expectation: invalid age should return 400
    expect(response.status).toBe(400);
  });

  it('POST /api/patients should reject age field if it exceeds reasonable bounds', async () => {
    const { POST } = await import('@/app/api/patients/route');

    const headers = makeMockHeaders({ role: 'consultant_doctor', wardIds: ['ward-0'] });
    const request = new NextRequest(new URL('http://localhost:3000/api/patients'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Valid Patient Name',
        age: 999, // Invalid: unrealistic age
        disease: 'Test Disease',
        wardId: 'ward-0',
      }),
    });

    const response = await POST(request);

    // SECURE expectation: unrealistic age should return 400
    expect(response.status).toBe(400);
  });

  it('POST /api/patients should validate name length (not accept 10KB+ strings)', async () => {
    const { POST } = await import('@/app/api/patients/route');

    const headers = makeMockHeaders({ role: 'consultant_doctor', wardIds: ['ward-0'] });
    const longName = 'A'.repeat(10000); // 10KB patient name

    const request = new NextRequest(new URL('http://localhost:3000/api/patients'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: longName,
        age: 45,
        disease: 'Test Disease',
        wardId: 'ward-0',
      }),
    });

    const response = await POST(request);

    // SECURE expectation: excessively long name should return 400
    expect(response.status).toBe(400);
  });

  it('POST /api/patients with valid data should return 201', async () => {
    const { POST } = await import('@/app/api/patients/route');

    const headers = makeMockHeaders({ role: 'consultant_doctor', wardIds: ['ward-0'] });
    const request = new NextRequest(new URL('http://localhost:3000/api/patients'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'John Doe',
        age: 45,
        disease: 'Hypertension',
        wardId: 'ward-0',
      }),
    });

    const response = await POST(request);

    // Should succeed with valid data
    expect(response.status).toBe(201);
  });
});