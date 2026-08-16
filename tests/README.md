# Testing Infrastructure

This directory contains the test suite for the Hospital Management System, built with **Vitest**.

## Quick Start

```bash
# Run all tests
npm run test

# Run tests in watch mode (auto-reload on file changes)
npm run test -- --watch

# Run with visual UI dashboard
npm run test:ui

# Run a specific test file
npm run test -- tests/security/rbac-security.test.ts

# Run tests matching a pattern
npm run test -- --grep "Finding #1"
```

## Directory Structure

```
tests/
├── setup.ts                    # Global test setup (runs before each test file)
├── README.md                   # This file
├── helpers/
│   └── mockSession.ts          # Reusable test utilities (mock factories)
└── security/
    └── rbac-security.test.ts   # RBAC & security vulnerability tests
```

## Test Helpers

### `tests/helpers/mockSession.ts`

Provides factory functions for creating test fixtures:

```typescript
import { makeSession, makeMockHeaders, makeMockDb } from '@/tests/helpers/mockSession';

// Create a mock user session
const adminSession = makeSession({ role: 'admin', wardIds: ['ward-0'] });

// Create mock request headers with auth
const headers = makeMockHeaders({ role: 'consultant_doctor', userId: 'test-123' });

// Create mock database with vitest mocks
const mockDb = makeMockDb();
```

#### Available Functions

| Function | Purpose |
|----------|---------|
| `makeSession(overrides?)` | Create a UserSession object with defaults |
| `makeMockHeaders(sessionData?)` | Create a Headers object with auth headers set |
| `makeMockHeadersNoRole()` | Create a Headers object with no role header (simulates missing auth) |
| `makeMockDb()` | Create a mock MongoDB Db object with all collections mocked |
| `makeMockCollection(name)` | Create a mock MongoDB Collection with vitest vi.fn() for methods |

## Test Structure

Tests are organized by security concern:

### Security Tests (`tests/security/rbac-security.test.ts`)

Documents confirmed security findings from the codebase audit. Each test is written to assert **SECURE/expected behavior**, so failing tests document actual bugs in the implementation.

**Current Test Coverage:**
- Finding #1: Session initialization unsafe fallback to admin
- Finding #2: /api/explain endpoint missing auth & permission checks
- Finding #3: main_attendant role permission boundaries
- Finding #4: NoSQL injection prevention in patient registration

## Adding New Tests

### 1. Create a new test file

```typescript
// tests/api/ward-validation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSession, makeMockHeaders } from '@/tests/helpers/mockSession';

describe('Ward Validation', () => {
  it('should reject ward with negative total beds', () => {
    // Test implementation
  });
});
```

### 2. Use mock helpers for common patterns

```typescript
// Mock database
vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(async () => ({
    db: makeMockDb(),
    client: {},
  })),
}));

// Test with mocked session
const headers = makeMockHeaders({ role: 'admin' });
const request = new NextRequest(new URL('http://localhost:3000/api/wards'), {
  headers,
  method: 'GET',
});
```

### 3. Test both success and failure cases

```typescript
it('should accept valid ward data', async () => {
  // Arrange: create valid input
  const validWard = { wardId: 'ward-0', name: 'General', totalBeds: 20 };
  
  // Act: call endpoint
  const response = await POST(request);
  
  // Assert: verify success
  expect(response.status).toBe(201);
});

it('should reject ward with missing name', async () => {
  // Arrange: create invalid input
  const invalidWard = { wardId: 'ward-0', totalBeds: 20 }; // missing name
  
  // Act: call endpoint
  const response = await POST(request);
  
  // Assert: verify error
  expect(response.status).toBe(400);
});
```

## Vitest Configuration

Vitest is configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',                    // Testing API routes, not browser
    setupFiles: ['./tests/setup.ts'],       // Run before each test file
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),    // Resolve @/ imports
    },
  },
});
```

## Database Mocking

MongoDB is mocked using Vitest's `vi.mock()`:

```typescript
vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(async () => ({
    db: {
      collection: vi.fn(() => ({
        findOne: vi.fn(),
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
        insertOne: vi.fn(),
        updateOne: vi.fn(),
        deleteOne: vi.fn(),
      })),
    },
    client: {},
  })),
}));
```

No external database is needed for tests. Each collection method is a `vi.fn()` that can be configured per test:

```typescript
const { db } = await import('@/lib/mongodb').then(m => m.connectToDatabase());
db.collection('patients').findOne.mockResolvedValue({ id: '123', name: 'John' });
```

## Test Results

**Summary:** 13 tests total (8 failing, 5 passing)

Failing tests document confirmed security/validation gaps; passing tests confirm
correctly implemented behavior. Full findings write-up: see
`docs/Security_Test_Findings_Report.pdf` in the project root.

Key findings covered by this suite:
- Missing auth header/input defaults to admin role
- `/api/explain` has no authentication or permission check (verified via static
  source inspection, since the route's dependency chain includes a real
  MAPPO/PyTorch model load outside the scope of this check)
- `main_attendant` permission matrix (confirmed correct; one value flagged for
  product review, not a bug)
- `POST /api/patients` accepts invalid/malicious input with no validation

## Common Issues

### Import paths not resolved

**Error:** `Failed to load url @/lib/rbac`

**Solution:** Ensure `vite-tsconfig-paths` is loaded in `vitest.config.ts`

```typescript
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()], // ← Required
  // ...
});
```

### Mock not working

**Problem:** `vi.mock()` calls don't seem to take effect

**Solution:** Ensure mocks are declared BEFORE importing the module:

```typescript
// ✅ CORRECT: Mock declared first
vi.mock('@/lib/mongodb', () => ({ /* ... */ }));
import { connectToDatabase } from '@/lib/mongodb';

// ❌ WRONG: Import before mock
import { connectToDatabase } from '@/lib/mongodb';
vi.mock('@/lib/mongodb', () => ({ /* ... */ }));
```

### Async test timeouts

**Problem:** Tests timeout waiting for promises

**Solution:** Ensure mock promises resolve:

```typescript
// ✅ Use mockResolvedValue for promises
collection.findOne.mockResolvedValue(mockData);

// ❌ DON'T return a regular value for async functions
collection.findOne.mockReturnValue(mockData);
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest Mock Functions](https://vitest.dev/api/vi.html)
- [Next.js Testing Guide](https://nextjs.org/docs/app/building-your-application/testing)
