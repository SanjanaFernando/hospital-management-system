import Link from "next/link";
import { getPatientsPageData } from "@/lib/hospital-data";

type SearchParams = Record<string, string | string[] | undefined>;

interface PatientsPageProps {
  searchParams?: SearchParams | Promise<SearchParams>;
}

function getFirstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

function buildQueryString(params: {
  searchTerm?: string;
  page: number;
  pageSize: number;
  wardId?: string;
}): string {
  const searchParams = new URLSearchParams();

  if (params.searchTerm) {
    searchParams.set("q", params.searchTerm);
  }

  if (params.wardId) {
    searchParams.set("wardId", params.wardId);
  }

  searchParams.set("page", String(params.page));
  searchParams.set("pageSize", String(params.pageSize));

  return searchParams.toString();
}

function formatDate(value?: Date): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PatientsPage({
  searchParams,
}: PatientsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const searchTerm = getFirstValue(resolvedSearchParams.q);
  const wardId = getFirstValue(resolvedSearchParams.wardId);
  const page = Math.max(
    1,
    Number.parseInt(getFirstValue(resolvedSearchParams.page) || "1", 10) || 1
  );
  const pageSize = Math.min(
    50,
    Math.max(
      5,
      Number.parseInt(
        getFirstValue(resolvedSearchParams.pageSize) || "15",
        10
      ) || 15
    )
  );

  const data = await getPatientsPageData({
    searchTerm,
    wardId: wardId || undefined,
    page,
    pageSize,
  });

  const summaryCards = [
    {
      label: "Patients",
      value: data.totalItems,
      tone: "border-sky-500 text-sky-600",
    },
    {
      label: "Current Page",
      value: `${data.page} / ${data.totalPages}`,
      tone: "border-emerald-500 text-emerald-600",
    },
    {
      label: "Page Size",
      value: data.pageSize,
      tone: "border-amber-500 text-amber-600",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">
              Server-rendered list
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">Patients</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Search and paginate on the server so the page streams quickly and
              only ships the minimum client code.
            </p>
          </div>

          <form
            action="/patients"
            method="get"
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <input type="hidden" name="page" value="1" />
            {wardId ? (
              <input type="hidden" name="wardId" value={wardId} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={searchTerm}
              placeholder="Search name, disease, or patient id"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Search
            </button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-3xl border-l-4 bg-white p-5 shadow-sm ${card.tone}`}
            >
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold">Patient Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {data.patients.length} of {data.totalItems} matched
              patients.
            </p>
          </div>

          {data.patients.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No patients matched your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Patient</th>
                    <th className="px-6 py-3 font-medium">Ward</th>
                    <th className="px-6 py-3 font-medium">Condition</th>
                    <th className="px-6 py-3 font-medium">Priority</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Admission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        <div>
                          <p>{patient.name}</p>
                          <p className="text-xs text-slate-500">{patient.id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {patient.wardId || "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {patient.disease}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {patient.priority}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {patient.status || "unknown"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {formatDate(patient.admissionTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-sm text-slate-500">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={`/patients?${buildQueryString({
                searchTerm: data.searchTerm,
                wardId: data.wardId,
                page: Math.max(1, data.page - 1),
                pageSize: data.pageSize,
              })}`}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                data.page <= 1
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              aria-disabled={data.page <= 1}
            >
              Previous
            </Link>
            <Link
              href={`/patients?${buildQueryString({
                searchTerm: data.searchTerm,
                wardId: data.wardId,
                page: Math.min(data.totalPages, data.page + 1),
                pageSize: data.pageSize,
              })}`}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                data.page >= data.totalPages
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
              aria-disabled={data.page >= data.totalPages}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
