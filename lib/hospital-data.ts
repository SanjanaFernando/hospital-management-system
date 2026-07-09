import { unstable_cache } from "next/cache";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { Bed, Patient, Ward } from "@/app/types";
import { reorderQueueWithAi } from "@/lib/queueAi";

type MongoDoc = Record<string, unknown>;

export interface DashboardWardSummary {
  id: string;
  wardId: string;
  name: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  queuedPatients: number;
}

export interface DashboardData {
  wards: DashboardWardSummary[];
  totals: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    maintenanceBeds: number;
    queuedPatients: number;
  };
}

export interface PatientsPageData {
  patients: Patient[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
  searchTerm: string;
  wardId?: string;
}

export interface DailyPatientDataPoint {
  day: string;
  patients: number;
  [key: string]: any;
}

const WARD_SUMMARY_TAGS = ["dashboard", "wards", "patients", "beds"];
const DASHBOARD_REVALIDATE_SECONDS = 30;
const WARD_DETAIL_REVALIDATE_SECONDS = 15;
const PATIENTS_PAGE_REVALIDATE_SECONDS = 15;

const WARD_PROJECTION = {
  wardId: 1,
  name: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const PATIENT_PROJECTION = {
  id: 1,
  name: 1,
  age: 1,
  ageGroup: 1,
  gender: 1,
  disease: 1,
  priority: 1,
  admissionTime: 1,
  dischargeTime: 1,
  queueWaitTime: 1,
  specialRequirements: 1,
  wardId: 1,
  assignedFromWardId: 1,
  status: 1,
  triageRequested: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const BED_PROJECTION = {
  bedId: 1,
  id: 1,
  wardId: 1,
  bedNumber: 1,
  status: 1,
  type: 1,
  patientId: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

function serializeDoc(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeDoc);
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;

    if ("_bsontype" in objectValue && objectValue._bsontype === "ObjectId") {
      return String(value);
    }

    const serialized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(objectValue)) {
      serialized[key] = serializeDoc(nestedValue);
    }
    return serialized;
  }

  return value;
}

function toId(doc: MongoDoc): string {
  return String(doc.id || doc.bedId || doc.wardId || doc._id || "");
}

function toWardId(doc: MongoDoc): string {
  return String(doc.wardId || "");
}

function normalizePatient(doc: MongoDoc): Patient {
  const serialized = serializeDoc(doc) as MongoDoc;

  return {
    _id: serialized._id ? String(serialized._id) : undefined,
    id: String(serialized.id || serialized._id || ""),
    name: String(serialized.name || ""),
    age: Number(serialized.age || 0),
    ageGroup: (serialized.ageGroup as Patient["ageGroup"]) || "Adult",
    gender: serialized.gender as Patient["gender"],
    disease: String(serialized.disease || ""),
    priority: (serialized.priority as Patient["priority"]) || "Triage 5",
    admissionTime: serialized.admissionTime
      ? new Date(String(serialized.admissionTime))
      : new Date(0),
    dischargeTime: serialized.dischargeTime
      ? new Date(String(serialized.dischargeTime))
      : undefined,
    queueWaitTime:
      serialized.queueWaitTime === undefined
        ? undefined
        : Number(serialized.queueWaitTime),
    specialRequirements: Array.isArray(serialized.specialRequirements)
      ? (serialized.specialRequirements as string[])
      : undefined,
    wardId: serialized.wardId ? String(serialized.wardId) : undefined,
    assignedFromWardId: serialized.assignedFromWardId
      ? String(serialized.assignedFromWardId)
      : null,
    status: serialized.status as Patient["status"],
    triageRequested: Boolean(serialized.triageRequested),
  };
}

function normalizeBed(doc: MongoDoc, admittedPatients: Patient[]): Bed {
  const serialized = serializeDoc(doc) as MongoDoc;
  const patientId = String(serialized.patientId || "");
  const patient = patientId
    ? admittedPatients.find((candidate) => candidate.id === patientId)
    : undefined;

  return {
    id: String(serialized.bedId || serialized.id || serialized._id || ""),
    bedNumber: Number(serialized.bedNumber || 0),
    status: (serialized.status as Bed["status"]) || "available",
    type: (serialized.type as Bed["type"]) || "NORMAL",
    patient,
  };
}

function sortBeds(beds: Bed[]): Bed[] {
  return [...beds].sort((left, right) => {
    const leftPriority = left.type === "ICU" ? 0 : 1;
    const rightPriority = right.type === "ICU" ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return (left.bedNumber || 0) - (right.bedNumber || 0);
  });
}

function groupByWard<T extends MongoDoc>(docs: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const doc of docs) {
    const wardId = toWardId(doc);
    if (!wardId) {
      continue;
    }

    const bucket = grouped.get(wardId);
    if (bucket) {
      bucket.push(doc);
    } else {
      grouped.set(wardId, [doc]);
    }
  }

  return grouped;
}

async function queryDashboardData(): Promise<DashboardData> {
  const { db } = await connectToDatabase();

  const [wardDocs, patientDocs, bedDocs] = await Promise.all([
    db.collection("wards").find({}, { projection: WARD_PROJECTION }).toArray(),
    db
      .collection("patients")
      .find({}, { projection: PATIENT_PROJECTION })
      .toArray(),
    db.collection("beds").find({}, { projection: BED_PROJECTION }).toArray(),
  ]);

  const patientByWard = groupByWard(patientDocs as MongoDoc[]);
  const bedByWard = groupByWard(bedDocs as MongoDoc[]);

  const wards = wardDocs
    .map((wardDoc) => {
      const ward = wardDoc as MongoDoc;
      const wardId = String(ward.wardId || "");
      const patients = (patientByWard.get(wardId) || []).map(normalizePatient);
      const beds = (bedByWard.get(wardId) || []).map((bedDoc) =>
        normalizeBed(bedDoc, patients)
      );

      const occupiedBeds = beds.filter(
        (bed) => bed.status === "occupied"
      ).length;
      const availableBeds = beds.filter(
        (bed) => bed.status === "available"
      ).length;
      const maintenanceBeds = beds.filter(
        (bed) => bed.status === "maintenance"
      ).length;
      const queuedPatients = patients.filter(
        (patient) => patient.status === "queued"
      ).length;

      return {
        id: toId(ward),
        wardId,
        name: String(ward.name || wardId),
        totalBeds: beds.length,
        occupiedBeds,
        availableBeds,
        maintenanceBeds,
        queuedPatients,
      } satisfies DashboardWardSummary;
    })
    .filter((ward) => ward.wardId);

  const totals = wards.reduce(
    (accumulator, ward) => {
      accumulator.totalBeds += ward.totalBeds;
      accumulator.occupiedBeds += ward.occupiedBeds;
      accumulator.availableBeds += ward.availableBeds;
      accumulator.maintenanceBeds += ward.maintenanceBeds;
      accumulator.queuedPatients += ward.queuedPatients;
      return accumulator;
    },
    {
      totalBeds: 0,
      occupiedBeds: 0,
      availableBeds: 0,
      maintenanceBeds: 0,
      queuedPatients: 0,
    }
  );

  return { wards, totals };
}

async function queryWardsWithPatients(): Promise<Ward[]> {
  const { db } = await connectToDatabase();

  const [wardDocs, patientDocs, bedDocs] = await Promise.all([
    db.collection("wards").find({}, { projection: WARD_PROJECTION }).toArray(),
    db
      .collection("patients")
      .find({}, { projection: PATIENT_PROJECTION })
      .toArray(),
    db.collection("beds").find({}, { projection: BED_PROJECTION }).toArray(),
  ]);

  const patientByWard = groupByWard(patientDocs as MongoDoc[]);
  const bedByWard = groupByWard(bedDocs as MongoDoc[]);

  return wardDocs
    .map((wardDoc) => {
      const ward = wardDoc as MongoDoc;
      const wardId = String(ward.wardId || "");
      const patients = (patientByWard.get(wardId) || []).map(normalizePatient);
      const admittedPatients = patients.filter(
        (patient) => patient.status === "admitted"
      );
      const queuedPatients = patients.filter(
        (patient) => patient.status === "queued"
      );
      const dischargedPatients = patients.filter(
        (patient) => patient.status === "discharged"
      );
      const beds = sortBeds(
        (bedByWard.get(wardId) || []).map((bedDoc) =>
          normalizeBed(bedDoc, admittedPatients)
        )
      );

      const occupiedBeds = beds.filter(
        (bed) => bed.status === "occupied"
      ).length;
      const availableBeds = beds.filter(
        (bed) => bed.status === "available"
      ).length;
      const maintenanceBeds = beds.filter(
        (bed) => bed.status === "maintenance"
      ).length;

      return {
        id: toId(ward),
        wardId,
        name: String(ward.name || wardId),
        beds,
        patients: admittedPatients,
        patientQueue: queuedPatients,
        dischargedPatients,
        totalBeds: beds.length,
        occupiedBeds,
        availableBeds,
        maintenanceBeds,
      } satisfies Ward;
    })
    .filter((ward) => ward.wardId);
}

async function queryWardWithPatients(wardId: string): Promise<Ward | null> {
  if (!wardId) {
    return null;
  }

  const { db } = await connectToDatabase();

  const wardQuery: Record<string, unknown> = { wardId };
  const wardDoc = await db.collection("wards").findOne(wardQuery, {
    projection: WARD_PROJECTION,
  });

  let resolvedWardDoc = wardDoc;
  if (!resolvedWardDoc && ObjectId.isValid(wardId)) {
    resolvedWardDoc = await db
      .collection("wards")
      .findOne({ _id: new ObjectId(wardId) }, { projection: WARD_PROJECTION });
  }

  if (!resolvedWardDoc) {
    return null;
  }

  const ward = serializeDoc(resolvedWardDoc) as MongoDoc;
  const effectiveWardId = String(ward.wardId || wardId);

  const [patientDocs, bedDocs] = await Promise.all([
    db
      .collection("patients")
      .find({ wardId: effectiveWardId }, { projection: PATIENT_PROJECTION })
      .toArray(),
    db
      .collection("beds")
      .find({ wardId: effectiveWardId }, { projection: BED_PROJECTION })
      .toArray(),
  ]);

  const patients = (patientDocs as MongoDoc[]).map(normalizePatient);
  const admittedPatients = patients.filter(
    (patient) => patient.status === "admitted"
  );
  const queuedPatients = patients.filter(
    (patient) => patient.status === "queued"
  );
  const dischargedPatients = patients.filter(
    (patient) => patient.status === "discharged"
  );
  const beds = sortBeds(
    (bedDocs as MongoDoc[]).map((bedDoc) =>
      normalizeBed(bedDoc, admittedPatients)
    )
  );

  let queueResult;
  if (queuedPatients.length === 0) {
    queueResult = {
      orderedPatients: [],
      strategy: "priority" as const,
      message: "Queue is empty",
    };
  } else {
    // Use AI model to reorder the queue
    const aiResult = reorderQueueWithAi({
      targetWardId: effectiveWardId,
      targetWardName: String(ward.name || effectiveWardId),
      targetWardQueue: queuedPatients,
      targetWardOccupiedBeds: beds.filter((bed) => bed.status === "occupied")
        .length,
      targetWardTotalBeds: beds.length,
      wards: [],
      patientHistory: (patientDocs as MongoDoc[]).map((patientDoc) => ({
        admissionTime: patientDoc.admissionTime as string | Date | undefined,
        priority: patientDoc.priority as string | number | undefined,
        triageLevel: patientDoc.triageLevel as number | undefined,
      })),
    });
    queueResult = {
      orderedPatients: aiResult.orderedPatients,
      strategy: aiResult.strategy,
      message: aiResult.message,
    };
  }

  return {
    id: String(ward._id || ward.wardId || ""),
    wardId: effectiveWardId,
    name: String(ward.name || effectiveWardId),
    beds,
    patients: admittedPatients,
    patientQueue: queueResult.orderedPatients,
    dischargedPatients,
    totalBeds: beds.length,
    occupiedBeds: beds.filter((bed) => bed.status === "occupied").length,
    availableBeds: beds.filter((bed) => bed.status === "available").length,
    maintenanceBeds: beds.filter((bed) => bed.status === "maintenance").length,
    queueOrderStrategy: queueResult.strategy,
    queueOrderMessage: queueResult.message,
  } satisfies Ward;
}

async function queryPatientsPageData({
  searchTerm = "",
  page = 1,
  pageSize = 15,
  wardId,
}: {
  searchTerm?: string;
  page?: number;
  pageSize?: number;
  wardId?: string;
}): Promise<PatientsPageData> {
  const { db } = await connectToDatabase();
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedPageSize = Math.min(50, Math.max(5, Math.floor(pageSize)));
  const skip = (normalizedPage - 1) * normalizedPageSize;

  const query: Record<string, unknown> = {};
  type PatientSortOrder = {
    score?: { $meta: "textScore" };
    createdAt?: -1;
    admissionTime?: -1;
    name?: 1;
  };

  if (wardId) {
    query.wardId = wardId;
  }

  const trimmedSearch = searchTerm.trim();
  if (trimmedSearch) {
    query.$text = { $search: trimmedSearch };
  }

  const sortOrder: PatientSortOrder = trimmedSearch
    ? { score: { $meta: "textScore" }, createdAt: -1 }
    : { createdAt: -1, admissionTime: -1, name: 1 };

  const [totalItems, patientDocs] = await Promise.all([
    db.collection("patients").countDocuments(query),
    db
      .collection("patients")
      .find(query, { projection: PATIENT_PROJECTION })
      .sort(sortOrder)
      .skip(skip)
      .limit(normalizedPageSize)
      .toArray(),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));

  return {
    patients: (patientDocs as MongoDoc[]).map(normalizePatient),
    totalItems,
    totalPages,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    searchTerm: trimmedSearch,
    wardId,
  };
}

async function queryDailyPatientData(wardIds?: string[]): Promise<DailyPatientDataPoint[]> {
  const { db } = await connectToDatabase();

  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  });
  const dayKeyFormatter = new Intl.DateTimeFormat("en-CA");

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  const days = new Map<string, DailyPatientDataPoint>();
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.set(dayKeyFormatter.format(date), {
      day: dayFormatter.format(date),
      patients: 0,
    });
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  // Fetch ward information to map wardId to name
  const wardDocs = await db
    .collection("wards")
    .find({}, { projection: { wardId: 1, name: 1 } })
    .toArray();
  const wardNameMap = new Map<string, string>();
  for (const doc of wardDocs) {
    if (doc.wardId) {
      wardNameMap.set(String(doc.wardId), String(doc.name || doc.wardId));
    }
  }

  const query: any = {
    admissionTime: {
      $gte: start,
      $lt: end,
    },
  };

  if (wardIds && wardIds.length > 0) {
    query.wardId = { $in: wardIds };
  }

  const patientDocs = await db
    .collection("patients")
    .find(query, { projection: { admissionTime: 1, wardId: 1 } })
    .toArray();

  for (const doc of patientDocs as MongoDoc[]) {
    const admissionTime = doc.admissionTime
      ? new Date(String(doc.admissionTime))
      : null;
    if (!admissionTime || Number.isNaN(admissionTime.getTime())) {
      continue;
    }

    if (admissionTime >= end) {
      continue;
    }

    const key = dayKeyFormatter.format(admissionTime);
    const entry = days.get(key);
    if (entry) {
      entry.patients += 1;
      const pWardId = String(doc.wardId || "");
      if (pWardId) {
        const wardName = wardNameMap.get(pWardId) || pWardId;
        entry[pWardId] = (entry[pWardId] || 0) + 1;
        entry[wardName] = (entry[wardName] || 0) + 1;
      }
    }
  }

  return Array.from(days.values());
}

const cachedDashboardData = unstable_cache(
  queryDashboardData,
  ["dashboard-data"],
  {
    revalidate: DASHBOARD_REVALIDATE_SECONDS,
    tags: WARD_SUMMARY_TAGS,
  }
);

const cachedWardsWithPatients = unstable_cache(
  queryWardsWithPatients,
  ["wards-with-patients"],
  {
    revalidate: DASHBOARD_REVALIDATE_SECONDS,
    tags: WARD_SUMMARY_TAGS,
  }
);

const cachedWardWithPatients = unstable_cache(
  queryWardWithPatients,
  ["ward-with-patients"],
  {
    revalidate: WARD_DETAIL_REVALIDATE_SECONDS,
    tags: WARD_SUMMARY_TAGS,
  }
);

const cachedPatientsPage = unstable_cache(
  queryPatientsPageData,
  ["patients-page"],
  {
    revalidate: PATIENTS_PAGE_REVALIDATE_SECONDS,
    tags: ["patients"],
  }
);

const cachedDailyPatientData = unstable_cache(
  (wardIdsKey?: string) => {
    const wardIds = wardIdsKey ? wardIdsKey.split(",") : undefined;
    return queryDailyPatientData(wardIds);
  },
  ["daily-patient-data"],
  {
    revalidate: PATIENTS_PAGE_REVALIDATE_SECONDS,
    tags: ["patients"],
  }
);

export async function getDashboardData(): Promise<DashboardData> {
  return cachedDashboardData();
}

export async function getWardsWithPatientsData(): Promise<Ward[]> {
  return cachedWardsWithPatients();
}

export async function getWardWithPatientsData(
  wardId: string
): Promise<Ward | null> {
  return cachedWardWithPatients(wardId);
}

export async function getPatientsPageData(input: {
  searchTerm?: string;
  page?: number;
  pageSize?: number;
  wardId?: string;
}): Promise<PatientsPageData> {
  return cachedPatientsPage(input);
}

export async function getDailyPatientData(wardIdsKey?: string): Promise<DailyPatientDataPoint[]> {
  return cachedDailyPatientData(wardIdsKey);
}
