import { describe, it, expect } from 'vitest';
import {
  canRegisterPatient,
  canSetTriage,
  canUpdateBedStatus,
  canManageWardActions,
  canAssignQueuedPatientAcrossWards,
  canManageStaff,
  canViewLogs,
  normalizeWardId,
} from './rbac';
import type { UserSession } from '@/app/types';

function makeSession(role: UserSession['role'], wardIds: string[] = []): UserSession {
  const normalizedWardIds = wardIds.map(normalizeWardId).filter(Boolean) as string[];
  return { role, wardIds: normalizedWardIds, wardId: normalizedWardIds[0], displayName: 'Test User' };
}


describe('canRegisterPatient', () => {
  it('admin can register in any ward, even unassigned', () => {
    expect(canRegisterPatient(makeSession('admin', []), 'ward-3')).toBe(true);
  });
  it('sub_admin can register in any ward, even unassigned', () => {
    expect(canRegisterPatient(makeSession('sub_admin', []), 'ward-3')).toBe(true);
  });
  it('consultant_doctor can register in an assigned ward', () => {
    expect(canRegisterPatient(makeSession('consultant_doctor', ['ward-3']), 'ward-3')).toBe(true);
  });
  it('consultant_doctor cannot register in an unassigned ward', () => {
    expect(canRegisterPatient(makeSession('consultant_doctor', ['ward-1']), 'ward-3')).toBe(false);
  });
  it('main_attendant can never register, even if assigned to the ward', () => {
    expect(canRegisterPatient(makeSession('main_attendant', ['ward-3']), 'ward-3')).toBe(false);
  });
});

describe('canSetTriage', () => {
  it('admin can set triage anywhere', () => {
    expect(canSetTriage(makeSession('admin', []), 'ward-3')).toBe(true);
  });
  it('consultant_doctor can set triage in an assigned ward', () => {
    expect(canSetTriage(makeSession('consultant_doctor', ['ward-3']), 'ward-3')).toBe(true);
  });
  it('consultant_doctor cannot set triage in an unassigned ward', () => {
    expect(canSetTriage(makeSession('consultant_doctor', ['ward-1']), 'ward-3')).toBe(false);
  });
  it('main_sister can never set triage, even if assigned', () => {
    expect(canSetTriage(makeSession('main_sister', ['ward-3']), 'ward-3')).toBe(false);
  });
});

describe('canAssignQueuedPatientAcrossWards', () => {
  it('consultant_doctor assigned to source ward can move patient out', () => {
    // Using ward-5 (not in the legacy remap table) to isolate cross-ward
    // logic from normalizeWardId's legacy-id behavior.
    expect(canAssignQueuedPatientAcrossWards(makeSession('consultant_doctor', ['ward-5']), 'ward-5', 'ward-3')).toBe(true);
  });

  it('consultant_doctor assigned to TARGET but not SOURCE cannot move patient', () => {
    expect(canAssignQueuedPatientAcrossWards(makeSession('consultant_doctor', ['ward-3']), 'ward-1', 'ward-3')).toBe(false);
  });

  it('correctly matches source ward when session wardId uses a legacy id', () => {
    // ward-1 legacy-maps to ward-4 (see LEGACY_WARD_ID_MAP in rbac.ts).
    // A consultant assigned to "ward-1" moving a patient FROM "ward-1"
    // should still be permitted after normalization is applied consistently
    // to both the session's wardIds and the sourceWardId parameter.
    const session = makeSession('consultant_doctor', ['ward-1']);
    expect(canAssignQueuedPatientAcrossWards(session, 'ward-1', 'ward-3')).toBe(true);
  });
});

describe('normalizeWardId', () => {
  it('maps legacy ward-0 to ward-3', () => {
    expect(normalizeWardId('ward-0')).toBe('ward-3');
  });
  it('returns undefined for empty input', () => {
    expect(normalizeWardId('')).toBeUndefined();
  });
  it('lowercases and trims input', () => {
    expect(normalizeWardId(' Ward-3 ')).toBe('ward-3');
  });
});