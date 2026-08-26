import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn: any) => fn),
}));

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
              toArray: vi.fn().mockResolvedValue([
                { wardId: 'ward-0', name: 'Ward A', totalBeds: 10 },
              ]),
            }),
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'ward-test-id' }),
            updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
          };
        }
        if (name === 'beds') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue([
                { bedId: 'bed-1', wardId: 'ward-0', status: 'available' },
              ]),
            }),
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'bed-test-id' }),
          };
        }
        if (name === 'patients') {
          return {
            findOne: vi.fn().mockResolvedValue({
              _id: 'patient-1',
              id: '123456',
              name: 'Test Patient',
              wardId: 'ward-0',
              priority: 'Triage 3',
            }),
            insertOne: vi.fn().mockResolvedValue({ insertedId: 'patient-test-id' }),
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

import { makeMockHeaders, makeMockHeadersNoRole } from '@/tests/helpers/mockSession';

describe('GET /api/wards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with ward list for an authenticated user', async () => {
    const { GET } = await import('@/app/api/wards/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/wards'), { headers });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});

describe('POST /api/wards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin can create a ward', async () => {
    const { POST } = await import('@/app/api/wards/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/wards'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ wardId: 'ward-9', name: 'Test Ward', totalBeds: 10 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('main_attendant cannot create a ward', async () => {
    const { POST } = await import('@/app/api/wards/route');
    const headers = makeMockHeaders({ role: 'main_attendant' });
    const request = new NextRequest(new URL('http://localhost:3000/api/wards'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ wardId: 'ward-9', name: 'Test Ward', totalBeds: 10 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});

describe('GET /api/beds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with bed list for an authenticated user', async () => {
    const { GET } = await import('@/app/api/beds/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/beds?wardId=ward-0'), { headers });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});

describe('POST /api/beds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when wardId is missing', async () => {
    const { POST } = await import('@/app/api/beds/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/beds'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ bedNumber: 5 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('admin can create a bed with valid data', async () => {
    const { POST } = await import('@/app/api/beds/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/beds'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ wardId: 'ward-0', bedNumber: 5, status: 'available' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});

describe('PUT /api/patients/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when patient does not exist', async () => {
    const { PUT } = await import('@/app/api/patients/[id]/route');
    const headers = makeMockHeaders({ role: 'admin' });
    const request = new NextRequest(new URL('http://localhost:3000/api/patients/999999'), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ priority: 'Triage 1' }),
    });
    const { connectToDatabase } = await import('@/lib/mongodb');
    (connectToDatabase as any).mockResolvedValueOnce({
      db: {
        collection: () => ({
          findOne: vi.fn().mockResolvedValue(null),
        }),
      },
      client: {},
    });
    const response = await PUT(request, { params: Promise.resolve({ id: '999999' }) });
    expect(response.status).toBe(404);
  });
});

describe('GET /api/health', () => {
  it('returns 200 when database connection succeeds', async () => {
    const { GET } = await import('@/app/api/health/route');
    const response = await GET();
    expect(response.status).toBe(200);
  });
});